/**
 * Recalculo V5 de la simulación de Administración.
 * Filosofía: premiar poco y castigar fuerte.
 * Las mejoras sistémicas se ponderan al 18%; las decisiones débiles reciben
 * penalizaciones directas altas y las restricciones estructurales pesan más.
 */
const SIM_V2 = Object.freeze({
  IMPACT_FACTOR: 0.18,
  RECALC_MARK: 'SIM_V5_SEVERA'
});

// Penalización directa sobre Salud final por calidad de la alternativa elegida.
// 0 = mejor decisión sistémica bajo las condiciones del caso.
// Una mala decisión puede eliminar el beneficio de varias buenas.
const SIM_DECISION_PENALTY = Object.freeze({
  1:  {A:6,  B:2, C:0, D:9},
  2:  {A:10, B:8, C:0, D:6},
  3:  {A:4,  B:8, C:0, D:10},
  4:  {A:8,  B:4, C:0, D:2},
  5:  {A:4,  B:0, C:12,D:8},
  6:  {A:8,  B:6, C:0, D:10},
  7:  {A:8,  B:0, C:4, D:10},
  8:  {A:14, B:8, C:0, D:6},
  9:  {A:8,  B:0, C:6, D:8},
  10: {A:8,  B:4, C:0, D:10}
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
    console.log('Bootstrap recalculo V5: ' + err);
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
      optionKey,
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
    let badChoices = 0;

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
      if (qPenalty >= 8) criticalChoices++;
      if (qPenalty >= 6) badChoices++;
    });

    fin = round1_(clampScore_(fin));
    ops = round1_(clampScore_(ops));
    people = round1_(clampScore_(people));
    clients = round1_(clampScore_(clients));
    adapt = round1_(clampScore_(adapt));

    const metricValues = [fin, ops, people, clients, adapt];
    const rawHealth = round2_(metricValues.reduce((s, v) => s + v, 0) / metricValues.length);
    const weakUnder65 = metricValues.filter(v => v < 65).length;
    const weakUnder55 = metricValues.filter(v => v < 55).length;
    const spread = Math.max.apply(null, metricValues) - Math.min.apply(null, metricValues);

    let structuralPenalty = 0;
    structuralPenalty += weakUnder65 * 3;
    structuralPenalty += weakUnder55 * 6;
    if (budget < 2000000) structuralPenalty += 8;
    if (budget < 1000000) structuralPenalty += 15;
    if (budget < 0) structuralPenalty += 20;
    if (spread > 30) structuralPenalty += 15;
    else if (spread > 20) structuralPenalty += 8;

    // Penalización adicional por acumulación de malas decisiones.
    if (badChoices >= 3) structuralPenalty += 6;
    if (badChoices >= 5) structuralPenalty += 10;
    if (criticalChoices >= 3) structuralPenalty += 10;

    const totalPenalty = round2_(structuralPenalty + decisionPenalty);
    const health = round2_(Math.max(0, Math.min(100, rawHealth - totalPenalty)));

    let status;
    if (budget < 0 || health < 50 || criticalChoices >= 5) {
      status = 'CRÍTICA';
    } else if (health < 65 || criticalChoices >= 3 || weakUnder65 >= 2) {
      status = 'EN RIESGO';
    } else if (health < 75) {
      status = 'ESTABLE';
    } else if (health < 85) {
      status = 'SALUDABLE';
    } else {
      status = 'EXCELENTE';
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

function round1_(n) {
  return Math.round(Number(n) * 10) / 10;
}

function round2_(n) {
  return Math.round(Number(n) * 100) / 100;
}
