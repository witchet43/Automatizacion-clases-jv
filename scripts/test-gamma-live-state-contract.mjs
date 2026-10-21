#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('src/60_SecuenciaRealClase.gs','utf8');
const manifest=JSON.parse(fs.readFileSync('config/academic-context.json','utf8'));
const ctx={console};
vm.createContext(ctx);
vm.runInContext(source,ctx,{filename:'60_SecuenciaRealClase.gs'});

const row={
  session:'16',unit:'Unidad 2',
  topic:'2.2.1 Software del sistema operativo + 2.2.2 Tipos del sistema operativo',
  practice:'Actividad 18 - La misma tarea en dos sistemas operativos',
  classroomIds:'Actividad 18: 888336039432 DRAFT',
  gammaUrl:'https://gamma.app/docs/Software-del-Sistema-Operativo-oualr71m0ys6x0v',
  gammaState:'GENERADA Y VERIFICADA'
};
const works=[{id:'888336039432',title:'Actividad 18 - La misma tarea en dos sistemas operativos',state:'DRAFT'}];

const planningOnly=ctx.evidenciaSesionReal_(row,works,{});
assert.equal(planningOnly.planningGammaClaimedVerified,true);
assert.equal(planningOnly.gammaVerificada,false);
assert.equal(planningOnly.paquetePreparado,false);
assert.equal(planningOnly.gammaDecision,'VERIFY_LIVE');

const active={source:'GAMMA_LIVE_CONNECTOR',status:'LIVE_ACTIVE_CANONICAL',gammaId:'g_active',
  gammaUrl:'https://gamma.app/docs/topic-g_active',title:row.topic,archived:false,
  contentVerified:true,canonicalTopicVerified:true,searchPerformed:true,activeEquivalentFound:false};
const activeEvidence=ctx.evidenciaSesionReal_(row,works,{'16':active});
assert.equal(activeEvidence.gammaVerificada,true);
assert.equal(activeEvidence.gammaCanReuse,true);
assert.equal(activeEvidence.gammaDecision,'REUSE');
assert.equal(activeEvidence.paquetePreparado,false);
assert.equal(activeEvidence.notionDecision,'VERIFY_LIVE');

const notionActive={source:'NOTION_LIVE_CONNECTOR',status:'LIVE_CANONICAL',pageId:'n16',
  pageUrl:'https://app.notion.com/p/n16',parentPageId:'parent',title:row.topic,
  contentVerified:true,canonicalTopicVerified:true,gammaReferenceVerified:true,
  searchPerformed:true,duplicateCount:1};
const fullyPrepared=ctx.evidenciaSesionReal_(row,works,{'16':active},{'16':notionActive});
assert.equal(fullyPrepared.gammaVerificada,true);
assert.equal(fullyPrepared.notionVerificada,true);
assert.equal(fullyPrepared.paquetePreparado,true);

const archived={source:'GAMMA_LIVE_CONNECTOR',status:'LIVE_ARCHIVED',gammaId:'oualr71m0ys6x0v',
  gammaUrl:row.gammaUrl,title:'Software del Sistema Operativo',archived:true,
  contentVerified:false,canonicalTopicVerified:false,searchPerformed:true,activeEquivalentFound:false};
const archivedEvidence=ctx.evidenciaSesionReal_(row,works,{'16':archived});
assert.equal(archivedEvidence.gammaVerificada,false);
assert.equal(archivedEvidence.gammaCanCreate,true);
assert.equal(archivedEvidence.gammaDecision,'CREATE');
assert.equal(archivedEvidence.paquetePreparado,false);

const duplicateFound={...archived,activeEquivalentFound:true};
const duplicateEvidence=ctx.evidenciaSesionReal_(row,works,{'16':duplicateFound});
assert.equal(duplicateEvidence.gammaCanCreate,false);
assert.equal(duplicateEvidence.gammaDecision,'REUSE_ACTIVE_EQUIVALENT');

const gammaWithNullTheme={...active,
  themeIdSent:'bfm8ztqy1whsib8',themeIdReturned:null,themeRequestVerified:true};
const gammaNullEvidence=ctx.evidenciaSesionReal_(row,works,{'16':gammaWithNullTheme},{'16':notionActive});
assert.equal(gammaNullEvidence.gammaVerificada,true,'NULL theme reply is not proof of a wrong theme');
assert.equal(gammaNullEvidence.gammaThemeWarning,'GAMMA_THEME_ID_NULL_RESPONSE_NON_BLOCKING');
assert.equal(gammaNullEvidence.paquetePreparado,true,'NULL theme reply cannot stop a complete package');
// Regression: a legacy NO APLICA claim cannot exempt an ordinary lesson.
const ordinary={...row,kind:'Clase ordinaria',gamma:'No aplica',gammaUrl:'No aplica',gammaState:'NO APLICA - pendiente'};
const missingOrdinary=ctx.evidenciaSesionReal_(ordinary,works,{}, {'16':notionActive});
assert.equal(missingOrdinary.gammaNoAplica,false);
assert.equal(missingOrdinary.paquetePreparado,false);
assert.equal(missingOrdinary.gammaDecision,'VERIFY_LIVE');
const restoredOrdinary=ctx.evidenciaSesionReal_(ordinary,works, {'16':active}, {'16':notionActive});
assert.equal(restoredOrdinary.paquetePreparado,true);
const integrator={...ordinary,kind:'Actividad integradora'};
const exempt=ctx.evidenciaSesionReal_(integrator,works,{}, {'16':notionActive});
assert.equal(exempt.gammaNoAplica,true);
assert.equal(exempt.paquetePreparado,true);

const policy=fs.readFileSync('src/00_PoliticasCanonicas.gs','utf8');
assert.match(policy,/NULL_THEME_ID_REPLY: 'WARN_CONTINUE'/);
assert.match(policy,/ORDINARY_CLASS_REQUIRES_GAMMA: true/);
assert.match(policy,/LEGACY_PLANNING_NO_APLICA_CANNOT_EXEMPT_ORDINARY_CLASS: true/);
assert.match(policy,/THEME_ID_MUST_BE_SENT: true/);
assert.match(policy,/UAQ: 'bfm8ztqy1whsib8'/);
assert.match(policy,/UMx: 'rhuzrubac7etaw3'/);

assert.equal(manifest.rules.planningGammaStateIsAuthority,false);
assert.equal(manifest.rules.gammaLiveVerificationRequiredBeforeReuse,true);
assert.equal(manifest.rules.gammaLiveSearchBeforeCreate,true);
assert.equal(manifest.rules.gammaArchivedCountsAsPrepared,false);
assert.equal(manifest.rules.gammaLiveEvidenceSource,'GAMMA_LIVE_CONNECTOR');
assert.equal(manifest.rules.gammaPostGenerationReadRequired,true);
assert.equal(manifest.rules.gammaActiveCanonicalOnlyCountsAsVerified,true);
assert.equal(manifest.rules.gammaPlanningStatusRole,'REFERENCE_ONLY');

console.log('PASS: Gamma real domina a la planeación; archivadas/no encontradas no acreditan clase y CREATE exige búsqueda LIVE sin equivalente activo.');
