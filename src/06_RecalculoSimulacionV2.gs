/**
 * Recalculo V7 de la simulación de Administración.
 * Ajuste balanceado y explicación visible de cada penalización aplicada.
 */
const SIM_V2 = Object.freeze({
  IMPACT_FACTOR: 0.22,
  RECALC_MARK: 'SIM_V7_MOTIVOS'
});

const SIM_DECISION_PENALTY = Object.freeze({
  1:  {A:4, B:1, C:0, D:6},
  2:  {A:6, B:5, C:0, D:4},
  3:  {A:3, B:5, C:0, D:6},
  4:  {A:5, B:3, C:0, D:1},
  5:  {A:3, B:0, C:8, D:5},
  6:  {A:5, B:4, C:0, D:6},
  7:  {A:5, B:0, C:3, D:6},
  8:  {A:9, B:5, C:0, D:4},
  9:  {A:5, B:0, C:4, D:5},
  10: {A:5, B:3, C:0, D:6}
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
    console.log('Bootstrap recalculo V7: ' + err);
  }
  return true;
})();

function recalcularSimulacionAdministracionV2() {
  const ss = SpreadsheetApp.openById(SIM_ADM.SPREADSHEET_ID);
  const results = ss.getSheetByName(SIM_ADM.RESULTS_SHEET);
  const impactsSheet = ss.getSheetByName(SIM_ADM.IMPACTS_SHEET);
  if (!results || !impactsSheet || results.getLastRow() < 2) return;

  // La columna Q queda reservada para explicar la penalización total.
  results.getRange(1, 17).setValue('Motivo de penalización');

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
    const reasons = [];

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
      if (qPenalty >= 6) criticalChoices++;
      if (qPenalty >= 4) badChoices++;
      if (qPenalty > 0) {
        reasons.push('D' + decision + '-' + impact.optionKey + ': -' + qPenalty + ' por ' + decisionPenaltyReason_(qPenalty));
      }
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
    if (weakUnder60) {
      const p = weakUnder60 * 3;
      structuralPenalty += p;
      reasons.push('-' + p + ' por ' + weakUnder60 + ' métrica(s) debajo de 60');
    }
    if (weakUnder50) {
      const p = weakUnder50 * 5;
      structuralPenalty += p;
      reasons.push('-' + p + ' adicional por ' + weakUnder50 + ' métrica(s) debajo de 50');
    }
    if (budget < 2000000) {
      structuralPenalty += 5;
      reasons.push('-5 por liquidez menor a $2,000,000');
    }
    if (budget < 1000000) {
      structuralPenalty += 8;
      reasons.push('-8 adicional por liquidez menor a $1,000,000');
    }
    if (budget < 0) {
      structuralPenalty += 12;
      reasons.push('-12 por presupuesto negativo');
    }
    if (spread > 30) {
      structuralPenalty += 8;
      reasons.push('-8 por desbalance mayor a 30 puntos entre áreas');
    } else if (spread > 20) {
      structuralPenalty += 4;
      reasons.push('-4 por desbalance mayor a 20 puntos entre áreas');
    }

    if (badChoices >= 4) {
      structuralPenalty += 4;
      reasons.push('-4 por acumular al menos 4 decisiones débiles');
    }
    if (badChoices >= 6) {
      structuralPenalty += 6;
      reasons.push('-6 adicional por acumular al menos 6 decisiones débiles');
    }
    if (criticalChoices >= 3) {
      structuralPenalty += 5;
      reasons.push('-5 por acumular al menos 3 decisiones críticas');
    }

    const totalPenalty = round2_(structuralPenalty + decisionPenalty);
    const health = round2_(Math.max(0, Math.min(100, rawHealth - totalPenalty)));

    let status;
    if (budget < 0 || health < 45 || criticalChoices >= 5) {
      status = 'CRÍTICA';
    } else if (health < 60 || criticalChoices >= 3 || weakUnder60 >= 2) {
      status = 'EN RIESGO';
    } else if (health < 70) {
      status = 'ESTABLE';
    } else if (health < 82) {
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
    results.getRange(r + 1, 17).setValue(reasons.length ? reasons.join(' | ') : 'Sin penalización');
  }

  rebuildSimulationDashboard_(ss);
}

function decisionPenaltyReason_(points) {
  if (points >= 8) return 'decisión de riesgo sistémico muy alto';
  if (points >= 6) return 'decisión crítica o fuertemente cortoplacista';
  if (points >= 4) return 'decisión débil con costo sistémico importante';
  if (points >= 2) return 'trade-off desfavorable o riesgo moderado';
  return 'trade-off menor frente a la alternativa más sólida';
}

function round1_(n) {
  return Math.round(Number(n) * 10) / 10;
}

function round2_(n) {
  return Math.round(Number(n) * 100) / 100;
}
