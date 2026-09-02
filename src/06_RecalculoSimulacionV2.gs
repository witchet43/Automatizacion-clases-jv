/**
 * Recalculo V2 de la simulación de Administración.
 * Corrige saturación de métricas: los impactos cualitativos se ponderan al 30%.
 * El presupuesto final también produce penalización de liquidez.
 */
const SIM_V2 = Object.freeze({
  IMPACT_FACTOR: 0.30,
  RECALC_MARK: 'SIM_V2_RECALCULADA'
});

const SIM_V2_BOOTSTRAP = (function () {
  try {
    const exists = ScriptApp.getProjectTriggers()
      .some(t => t.getHandlerFunction() === 'recalcularSimulacionAdministracionV2');
    if (!exists) {
      ScriptApp.newTrigger('recalcularSimulacionAdministracionV2')
        .timeBased()
        .everyMinutes(1)
        .create();
    }
  } catch (err) {
    console.log('Bootstrap recalculo V2: ' + err);
  }
  return true;
})();

function recalcularSimulacionAdministracionV2() {
  const ss = SpreadsheetApp.openById(SIM_ADM.SPREADSHEET_ID);
  const results = ss.getSheetByName(SIM_ADM.RESULTS_SHEET);
  const impactsSheet = ss.getSheetByName(SIM_ADM.IMPACTS_SHEET);
  if (!results || !impactsSheet || results.getLastRow() < 2) return;

  const impactValues = impactsSheet.getDataRange().getValues();
  const impacts = {};
  for (let r = 1; r < impactValues.length; r++) {
    const row = impactValues[r];
    const decision = Number(row[0]);
    const option = String(row[2] || '').trim();
    if (!decision || !option) continue;
    impacts[decision + '||' + option] = {
      budget: Number(row[3] || 0),
      fin: Number(row[4] || 0) * SIM_V2.IMPACT_FACTOR,
      ops: Number(row[5] || 0) * SIM_V2.IMPACT_FACTOR,
      people: Number(row[6] || 0) * SIM_V2.IMPACT_FACTOR,
      clients: Number(row[7] || 0) * SIM_V2.IMPACT_FACTOR,
      adapt: Number(row[8] || 0) * SIM_V2.IMPACT_FACTOR
    };
  }

  const values = results.getDataRange().getValues();
  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    const email = String(row[1] || '').trim();
    const decisionsText = String(row[15] || '').trim();
    if (!email || !decisionsText) continue;

    let budget = SIM_ADM.START_BUDGET;
    let fin = SIM_ADM.START_SCORE;
    let ops = SIM_ADM.START_SCORE;
    let people = SIM_ADM.START_SCORE;
    let clients = SIM_ADM.START_SCORE;
    let adapt = SIM_ADM.START_SCORE;

    const pieces = decisionsText.split(' | ');
    pieces.forEach(piece => {
      const m = piece.match(/^D(\d+):\s*(.*)$/s);
      if (!m) return;
      const decision = Number(m[1]);
      const option = String(m[2] || '').trim();
      const impact = impacts[decision + '||' + option];
      if (!impact) return;
      budget += impact.budget;
      fin += impact.fin;
      ops += impact.ops;
      people += impact.people;
      clients += impact.clients;
      adapt += impact.adapt;
    });

    fin = round1_(clampScore_(fin));
    ops = round1_(clampScore_(ops));
    people = round1_(clampScore_(people));
    clients = round1_(clampScore_(clients));
    adapt = round1_(clampScore_(adapt));

    const rawHealth = round2_((fin + ops + people + clients + adapt) / 5);
    let penalty = liquidityPenaltyV2_(budget);
    [fin, ops, people, clients, adapt].forEach(v => {
      if (v < 40) penalty += 5;
      else if (v < 55) penalty += 2;
    });

    const health = round2_(Math.max(0, Math.min(100, rawHealth - penalty)));
    const status = health >= 85 ? 'SALUDABLE' : health >= 70 ? 'ESTABLE' : health >= 55 ? 'EN RIESGO' : 'CRÍTICA';

    const metrics = [
      ['Finanzas', fin], ['Operaciones', ops], ['Personas', people], ['Clientes', clients], ['Adaptabilidad', adapt]
    ].sort((a, b) => b[1] - a[1]);

    results.getRange(r + 1, 3, 1, 13).setValues([[
      SIM_ADM.START_BUDGET,
      budget,
      fin,
      ops,
      people,
      clients,
      adapt,
      rawHealth,
      penalty,
      health,
      status,
      metrics[0][0] + ' (' + metrics[0][1] + ')',
      metrics[metrics.length - 1][0] + ' (' + metrics[metrics.length - 1][1] + ')'
    ]]);
  }

  rebuildSimulationDashboard_(ss);
}

function liquidityPenaltyV2_(budget) {
  if (budget < 0) return 20;
  if (budget < 500000) return 14;
  if (budget < 1000000) return 9;
  if (budget < 1500000) return 5;
  if (budget < 2000000) return 2;
  return 0;
}

function round1_(n) {
  return Math.round(Number(n) * 10) / 10;
}

function round2_(n) {
  return Math.round(Number(n) * 100) / 100;
}
