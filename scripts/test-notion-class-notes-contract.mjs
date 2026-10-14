#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('src/60_SecuenciaRealClase.gs','utf8');
const manifest=JSON.parse(fs.readFileSync('config/academic-context.json','utf8'));
const guide=fs.readFileSync('docs/notion-class-notes.md','utf8');
const ctx={console};
vm.createContext(ctx);
vm.runInContext(source,ctx,{filename:'60_SecuenciaRealClase.gs'});

const row={session:'16',unit:'Unidad 2',
  topic:'2.2.1 Software del sistema operativo + 2.2.2 Tipos del sistema operativo',
  practice:'Actividad 18 - La misma tarea en dos sistemas operativos',
  classroomIds:'Actividad 18: 888336039432 DRAFT',
  gammaUrl:'https://gamma.app/docs/old',gammaState:'GENERADA Y VERIFICADA'};
const works=[{id:'888336039432',title:row.practice,state:'DRAFT'}];
const gamma={source:'GAMMA_LIVE_CONNECTOR',status:'LIVE_ACTIVE_CANONICAL',gammaId:'g16',
  gammaUrl:'https://gamma.app/docs/g16',title:row.topic,archived:false,
  contentVerified:true,canonicalTopicVerified:true,searchPerformed:true,activeEquivalentFound:false};

let ev=ctx.evidenciaSesionReal_(row,works,{'16':gamma},{});
assert.equal(ev.gammaVerificada,true);
assert.equal(ev.notionVerificada,false);
assert.equal(ev.notionDecision,'VERIFY_LIVE');
assert.equal(ev.paquetePreparado,false);

const missing={source:'NOTION_LIVE_CONNECTOR',status:'LIVE_NOT_FOUND',pageId:'',pageUrl:'',
  parentPageId:manifest.courses['introduccion-tecnologias-informacion'].notionNotesPageId,
  title:row.topic,contentVerified:false,canonicalTopicVerified:false,gammaReferenceVerified:false,
  searchPerformed:true,duplicateCount:0};
ev=ctx.evidenciaSesionReal_(row,works,{'16':gamma},{'16':missing});
assert.equal(ev.notionDecision,'CREATE');
assert.equal(ev.notionCanCreate,true);
assert.equal(ev.paquetePreparado,false);

const canonical={...missing,status:'LIVE_CANONICAL',pageId:'3f9cd691-30bc-812f-9ac5-e31af4fb3f68',
  pageUrl:'https://app.notion.com/p/3f9cd69130bc812f9ac5e31af4fb3f68?pvs=204',
  contentVerified:true,canonicalTopicVerified:true,gammaReferenceVerified:true,duplicateCount:1};
ev=ctx.evidenciaSesionReal_(row,works,{'16':gamma},{'16':canonical});
assert.equal(ev.notionVerificada,true);
assert.equal(ev.notionDecision,'REUSE');
assert.equal(ev.paquetePreparado,true);

assert.equal(manifest.notion.classNotesRootPageId,'3f2cd691-30bc-8179-b64f-d36487424bfc');
assert.equal(manifest.notion.route,'NOTION_CONNECTOR');
assert.equal(manifest.rules.notionNotesRequiredForClassPackage,true);
assert.equal(manifest.rules.notionSearchBeforeCreate,true);
assert.equal(manifest.rules.notionPostCreateFetchRequired,true);
assert.equal(manifest.rules.notionDuplicateNotesAllowed,false);
assert.equal(manifest.rules.classPackageCompleteRequiresNotionNotes,true);
assert.equal(manifest.rules.classGenerationOrder,'GOOGLE_RESOURCES_THEN_GAMMA_THEN_NOTION_NOTES_THEN_POSTFLIGHT');
for(const [key,course] of Object.entries(manifest.courses)){
  assert.ok(course.notionNotesPageId,key+' notionNotesPageId');
  assert.match(course.notionNotesPageUrl,/^https:\/\/app\.notion\.com\/p\//,key+' notionNotesPageUrl');
}
for(const heading of manifest.notion.requiredSections) assert.ok(guide.includes(heading),heading);
assert.match(guide,/buscar antes de crear/i);
assert.match(guide,/Gamma canónica verificada.*Notion Notes.*postflight/i);

console.log('PASS: notas Notion son componente obligatorio, idempotente y LIVE del paquete de clase.');
