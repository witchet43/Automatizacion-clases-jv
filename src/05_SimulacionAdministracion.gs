/**
 * Simulación sistémica de Administración.
 * Configura automáticamente Forms de tipo SIMULACION, enlaza respuestas a Sheets,
 * calcula métricas empresariales y actualiza un tablero de resultados.
 */
const SIM_ADM = Object.freeze({
  SPREADSHEET_ID: '1YLSPcDSpqvaAk7lLeL6O3CTcgeqdrBtmxCgmdF6ISeA',
  COURSE_ID: '871158187513',
  QUIZZES_SHEET: 'Quizzes',
  IMPACTS_SHEET: 'Impactos Simulación',
  RESULTS_SHEET: 'Resultados Simulación',
  DASHBOARD_SHEET: 'Dashboard Simulación',
  TYPE: 'SIMULACION',
  START_BUDGET: 5000000,
  START_SCORE: 70,
  CONFIG_MARK: '[SIM_CONFIGURADA]'
});

const SIM_ADM_BOOTSTRAP = (function () {
  try {
    const exists = ScriptApp.getProjectTriggers()
      .some(t => t.getHandlerFunction() === 'procesarSimulacionesPendientes');
    if (!exists) {
      ScriptApp.newTrigger('procesarSimulacionesPendientes')
        .timeBased()
        .everyMinutes(1)
        .create();
    }
  } catch (err) {
    console.log('Bootstrap simulación: ' + err);
  }
  return true;
})();

function procesarSimulacionesPendientes() {
  const ss = SpreadsheetApp.openById(SIM_ADM.SPREADSHEET_ID);
  ensureSimulationSheets_(ss);
  const sheet = ss.getSheetByName(SIM_ADM.QUIZZES_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return;

  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(String);
  const col = name => headers.indexOf(name);
  const idxType = col('Tipo instrumento');
  const idxCourse = col('ID del curso');
  const idxState = col('Estado');
  const idxForm = col('ID del Form');
  const idxResult = col('Resultado / error');
  const idxUpdate = col('Última actualización');

  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    if (String(row[idxType] || '').trim().toUpperCase() !== SIM_ADM.TYPE) continue;
    if (String(row[idxCourse] || '').trim() !== SIM_ADM.COURSE_ID) continue;
    if (String(row[idxState] || '').trim().toUpperCase() !== 'CREADA') continue;
    const formId = String(row[idxForm] || '').trim();
    if (!formId) continue;
    const currentResult = String(row[idxResult] || '');
    if (currentResult.indexOf(SIM_ADM.CONFIG_MARK) >= 0) continue;

    const form = FormApp.openById(formId);
    try {
      form.setDestination(FormApp.DestinationType.SPREADSHEET, SIM_ADM.SPREADSHEET_ID);
    } catch (err) {
      console.log('Destino de respuestas: ' + err);
    }
    form.setConfirmationMessage(
      'Tu simulación fue registrada. Revisa la calificación y la retroalimentación de cada decisión. ' +
      'El resultado sistémico completo se integrará automáticamente en el tablero de la clase.'
    );
    ensureFormSubmitTrigger_(form);

    sheet.getRange(r + 1, idxResult + 1)
      .setValue((currentResult ? currentResult + ' ' : '') + SIM_ADM.CONFIG_MARK + ' Respuestas enlazadas a Sheets y tablero automático activo.');
    if (idxUpdate >= 0) sheet.getRange(r + 1, idxUpdate + 1).setValue(new Date());
  }
}

function ensureFormSubmitTrigger_(form) {
  const formId = form.getId();
  const exists = ScriptApp.getProjectTriggers().some(t =>
    t.getHandlerFunction() === 'procesarRespuestaSimulacion' &&
    String(t.getTriggerSourceId() || '') === formId
  );
  if (!exists) {
    ScriptApp.newTrigger('procesarRespuestaSimulacion')
      .forForm(form)
      .onFormSubmit()
      .create();
  }
}

function procesarRespuestaSimulacion(e) {
  if (!e || !e.response) return;
  const ss = SpreadsheetApp.openById(SIM_ADM.SPREADSHEET_ID);
  ensureSimulationSheets_(ss);

  const impacts = loadSimulationImpacts_(ss);
  const responses = e.response.getItemResponses();
  let budget = SIM_ADM.START_BUDGET;
  let fin = SIM_ADM.START_SCORE;
  let ops = SIM_ADM.START_SCORE;
  let people = SIM_ADM.START_SCORE;
  let clients = SIM_ADM.START_SCORE;
  let adapt = SIM_ADM.START_SCORE;
  const selected = [];

  responses.forEach((ir, index) => {
    const answer = String(ir.getResponse() == null ? '' : ir.getResponse()).trim();
    if (!answer) return;
    const key = (index + 1) + '||' + answer;
    const impact = impacts[key];
    if (!impact) return;
    budget += impact.budget;
    fin += impact.fin;
    ops += impact.ops;
    people += impact.people;
    clients += impact.clients;
    adapt += impact.adapt;
    selected.push('D' + (index + 1) + ': ' + impact.option);
  });

  fin = clampScore_(fin);
  ops = clampScore_(ops);
  people = clampScore_(people);
  clients = clampScore_(clients);
  adapt = clampScore_(adapt);

  const rawHealth = (fin + ops + people + clients + adapt) / 5;
  let penalty = 0;
  if (budget < 0) penalty += 15;
  [fin, ops, people, clients, adapt].forEach(v => { if (v < 40) penalty += 5; });
  const health = Math.max(0, Math.min(100, rawHealth - penalty));
  const status = health >= 80 ? 'SALUDABLE' : health >= 60 ? 'ESTABLE' : health >= 40 ? 'EN RIESGO' : 'CRÍTICA';

  const metrics = [
    ['Finanzas', fin], ['Operaciones', ops], ['Personas', people], ['Clientes', clients], ['Adaptabilidad', adapt]
  ];
  metrics.sort((a, b) => b[1] - a[1]);
  const strongest = metrics[0][0] + ' (' + metrics[0][1] + ')';
  const weakest = metrics[metrics.length - 1][0] + ' (' + metrics[metrics.length - 1][1] + ')';

  const email = e.response.getRespondentEmail() || '';
  upsertSimulationResult_(ss, {
    timestamp: e.response.getTimestamp(),
    email: email,
    budget: budget,
    fin: fin,
    ops: ops,
    people: people,
    clients: clients,
    adapt: adapt,
    rawHealth: rawHealth,
    penalty: penalty,
    health: health,
    status: status,
    strongest: strongest,
    weakest: weakest,
    decisions: selected.join(' | '),
    reason: 'Pendiente de recálculo automático'
  });
  rebuildSimulationDashboard_(ss);
}

function loadSimulationImpacts_(ss) {
  const sheet = ss.getSheetByName(SIM_ADM.IMPACTS_SHEET);
  const values = sheet.getDataRange().getValues();
  const map = {};
  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    const decision = Number(row[0]);
    const option = String(row[2] || '').trim();
    if (!decision || !option) continue;
    map[decision + '||' + option] = {
      option: option,
      budget: Number(row[3] || 0),
      fin: Number(row[4] || 0),
      ops: Number(row[5] || 0),
      people: Number(row[6] || 0),
      clients: Number(row[7] || 0),
      adapt: Number(row[8] || 0)
    };
  }
  return map;
}

function upsertSimulationResult_(ss, x) {
  const sheet = ss.getSheetByName(SIM_ADM.RESULTS_SHEET);
  const headers = [
    'Fecha','Correo verificado','Presupuesto inicial','Presupuesto final','Finanzas','Operaciones',
    'Personas','Clientes','Adaptabilidad','Salud bruta','Penalización','Salud final','Estado',
    'Fortaleza','Debilidad','Decisiones','Motivo de penalización'
  ];
  if (sheet.getLastRow() === 0) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  else sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  const data = sheet.getDataRange().getValues();
  let targetRow = -1;
  for (let r = 1; r < data.length; r++) {
    if (String(data[r][1] || '').toLowerCase() === String(x.email || '').toLowerCase() && x.email) {
      targetRow = r + 1;
      break;
    }
  }
  if (targetRow < 0) targetRow = Math.max(2, sheet.getLastRow() + 1);
  sheet.getRange(targetRow, 1, 1, headers.length).setValues([[
    x.timestamp, x.email, SIM_ADM.START_BUDGET, x.budget, x.fin, x.ops, x.people, x.clients, x.adapt,
    Number(x.rawHealth.toFixed(2)), x.penalty, Number(x.health.toFixed(2)), x.status,
    x.strongest, x.weakest, x.decisions, x.reason || 'Pendiente de recálculo automático'
  ]]);
}

function rebuildSimulationDashboard_(ss) {
  const results = ss.getSheetByName(SIM_ADM.RESULTS_SHEET);
  const dash = ss.getSheetByName(SIM_ADM.DASHBOARD_SHEET);
  dash.clearContents();
  const values = results.getDataRange().getValues();
  const rows = values.slice(1).filter(r => r[1]);
  rows.sort((a, b) => Number(b[11] || 0) - Number(a[11] || 0));

  dash.getRange('A1').setValue('SIMULACIÓN SISTÉMICA - SALUD DE LAS EMPRESAS');
  dash.getRange('A3:Q3').setValues([[
    'Posición','Correo','Salud final','Estado','Presupuesto final','Finanzas','Operaciones','Personas',
    'Clientes','Adaptabilidad','Penalización','Motivo de penalización','Fortaleza','Debilidad','Salud bruta','Presupuesto inicial','Fecha'
  ]]);

  if (rows.length) {
    const out = rows.map((r, i) => [
      i + 1, r[1], r[11], r[12], r[3], r[4], r[5], r[6], r[7], r[8], r[10], r[16] || 'Sin penalización', r[13], r[14], r[9], r[2], r[0]
    ]);
    dash.getRange(4, 1, out.length, out[0].length).setValues(out);

    const avg = idx => rows.reduce((s, r) => s + Number(r[idx] || 0), 0) / rows.length;
    dash.getRange('S1:T8').setValues([
      ['Resumen del grupo','Valor'],
      ['Participantes', rows.length],
      ['Salud promedio', Number(avg(11).toFixed(2))],
      ['Presupuesto final promedio', Number(avg(3).toFixed(0))],
      ['Finanzas promedio', Number(avg(4).toFixed(2))],
      ['Operaciones promedio', Number(avg(5).toFixed(2))],
      ['Personas promedio', Number(avg(6).toFixed(2))],
      ['Clientes promedio', Number(avg(7).toFixed(2))]
    ]);
  }
  dash.setFrozenRows(3);
  dash.autoResizeColumns(1, 20);
}

function ensureSimulationSheets_(ss) {
  let impacts = ss.getSheetByName(SIM_ADM.IMPACTS_SHEET);
  if (!impacts) impacts = ss.insertSheet(SIM_ADM.IMPACTS_SHEET);
  let results = ss.getSheetByName(SIM_ADM.RESULTS_SHEET);
  if (!results) results = ss.insertSheet(SIM_ADM.RESULTS_SHEET);
  let dashboard = ss.getSheetByName(SIM_ADM.DASHBOARD_SHEET);
  if (!dashboard) dashboard = ss.insertSheet(SIM_ADM.DASHBOARD_SHEET);

  if (impacts.getLastRow() === 0) {
    impacts.getRange(1, 1, 1, 10).setValues([[
      'Decisión','Clave','Opción exacta','Impacto presupuesto','Finanzas','Operaciones','Personas','Clientes','Adaptabilidad','Notas'
    ]]);
  }
  const headers = [
    'Fecha','Correo verificado','Presupuesto inicial','Presupuesto final','Finanzas','Operaciones','Personas',
    'Clientes','Adaptabilidad','Salud bruta','Penalización','Salud final','Estado','Fortaleza','Debilidad','Decisiones','Motivo de penalización'
  ];
  if (results.getLastRow() === 0) results.getRange(1, 1, 1, headers.length).setValues([headers]);
  else results.getRange(1, 1, 1, headers.length).setValues([headers]);
}

function clampScore_(value) {
  return Math.max(0, Math.min(100, Number(value || 0)));
}
