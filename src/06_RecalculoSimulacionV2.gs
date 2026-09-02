/**
 * Recalculo V4 de la simulación de Administración.
 * Mantiene los impactos sistémicos por métrica y añade una penalización explícita
 * por calidad de decisión. Una opción administrativamente débil puede empeorar la
 * salud global aunque otras métricas queden temporalmente altas.
 */
const SIM_V2 = Object.freeze({
  IMPACT_FACTOR: 0.30,
  RECALC_MARK: 'SIM_V4_RECALCULADA'
});

// Penalización directa sobre Salud final por calidad de la alternativa elegida.
// 0 = decisión sistémicamente más sólida bajo las condiciones del caso.
// Valores altos = decisión con costos ocultos, riesgo o visión local/cortoplacista.
const SIM_DECISION_PENALTY = Object.freeze({
  1:  {A:3, B:1, C:0, D:4},
  2:  {A:5, B:4, C:0, D:3},
  3:  {A:2, B:4, C:0, D:5},
  4:  {A:4, B:2, C:0, D:1},
  5:  {A:2, B:0, C:6, D:4},
  6:  {A:4, B:3, C:0, D:5},
  7:  {A:4, B:0, C:2, D:5},
  8:  {A:7, B:4, C:0, D:3},
  9:  {A:4, B:0, C:3, D:4},
  10: {A:4, B:2, C:0, D:5}
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
    console.log('Bootstrap recalculo V4: ' + err);
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
    const optionKey = String(row[1] || '').trim().toUpperCase();
    const option = String(row[2] || '').trim();
    if (!decision || !option) continue;
    impacts[decision + '||' + option] = {
      optionKey: optionKey,
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
    let decisionPenalty = 0;
    let criticalChoices = 0;

    decisionsText.split(' | ').forEach(piece => {
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

      const qPenalty = Number((SIM_DECISION_PENALTY[decision] || {})[impact.optionKey] || 0);
      decisionPenalty += qPenalty;
      if (qPenalty >= 5) criticalChoices++;
    });

    fin = round1_(clampScore_(fin));
    ops = round1_(clampScore_(ops));
    people = round1_(clampScore_(people));
    clients = round1_(clampScore_(clients));
    adapt = round1_(clampScore_(adapt));

    const metricValues = [fin, ops, people, clients, adapt];
    const rawHealth = round2_(metricValues.reduce((s, v) => s + v, 0) / metricValues.length);
    const weakUnder60 = metricValues.filter(v => v < 60).length;
    const weakUnder50 = metricValues.filter(v => v < 50).length;
    const spread = Math.max.apply(null, metricValues) - Math.min.apply(null, metricValues);

    let structuralPenalty = 0;
    structuralPenalty += weakUnder60 * 4;
    structuralPenalty += weakUnder50 * 8;
    if (budget < 2000000) structuralPenalty += 5;
    if (budget < 1000000) structuralPenalty += 10;
    if (spread > 30) structuralPenalty += 10;
    else if (spread > 20) structuralPenalty += 5;

    const totalPenalty = round2_(structuralPenalty + decisionPenalty);
    const health = round2_(Math.max(0, Math.min(100, rawHealth - totalPenalty)));
    let status;

    if (budget < 0) {
      status = 'CRÍTICA';
    } else if (weakUnder60 >= 2 || criticalChoices >= 3) {
      status = health < 50 ? 'CRÍTICA' : 'EN RIESGO';
    } else if (health >= 85) {
      status = 'EXCELENTE';
    } else if (health >= 75) {
      status = 'SALUDABLE';
    } else if (health >= 65) {
      status = 'ESTABLE';
    } else if (health >= 50) {
      status = 'EN RIESGO';
    } else {
      status = 'CRÍTICA';
    }

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
      totalPenalty,
      health,
      status,
      metrics[0][0] + ' (' + metrics[0][1] + ')',
      metrics[metrics.length - 1][0] + ' (' + metrics[metrics.length - 1][1] + ')'
    ]]);
  }

  rebuildSimulationDashboard_(ss);
}

function liquidityPenaltyV2_(budget) {
  if (budget < 0) return 15;
  if (budget < 1000000) return 15;
  if (budget < 2000000) return 5;
  return 0;
}

function round1_(n) {
  return Math.round(Number(n) * 10) / 10;
}

function round2_(n) {
  return Math.round(Number(n) * 100) / 100;
}
