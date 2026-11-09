import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const code=fs.readFileSync('src/68_ConciliacionActividadesWebApp.gs','utf8');
const web=fs.readFileSync('src/65_QuizAsistenciaWebApp.gs','utf8');
assert.match(web,/RECONCILE_PLAN/);
assert.match(web,/RECONCILE_APPLY/);
assert.match(web,/reconciliarActividadesClaseWeb_\(course,p,works\)/);
assert.doesNotMatch(code,/Classroom\.Courses\.CourseWork\.(create|patch|remove)\(/,
  'Nunca reescribir o borrar actividades publicadas durante la reconciliación');
const ctx={String,Number,Object,Array,Set,RegExp,Error};
vm.createContext(ctx);
vm.runInContext(code,ctx);
const cw=(n,id,tail,state='PUBLISHED')=>({id:String(id),state,
  title:`Actividad ${String(n).padStart(2,'0')} - ${tail}`});
const planned=(n,tail,id,workId='')=>({
 key:'DOC:'+id,documentId:id,origin:'PLANEACIÓN',number:n,originalNumber:n,
 title:`Actividad ${String(n).padStart(2,'0')} - ${tail}`,sheetRow:n+1,workId
});
const classroom=[
 cw(3,300,'Árbol de decisión'),cw(4,400,'Arquitectura'),
 cw(6,600,'Diagrama'),cw(7,700,'Dashboard', 'DRAFT'),
 cw(8,800,'Gantt'),cw(9,900,'Simulador'),
 cw(10,1000,'Dos ejercicios FCFS'),cw(11,1100,'Dos ejercicios SJF'),
 cw(12,1200,'Dos ejercicios Round Robin'),cw(13,1300,'Dos ejercicios prioridades')];
const docs=[
 planned(1,'Matriz','p1'),planned(2,'Evolución','p2'),
 planned(3,'Árbol de decisión','p3','300'),planned(4,'Arquitectura','p4','400'),
 planned(5,'Integración','p5'),planned(6,'Diagrama','p6','600'),
 planned(7,'Dashboard','p7','700'),planned(8,'Gantt','p8','800'),
 planned(9,'Simulador','p9','900'),planned(10,'Deadlock','p10'),
 planned(11,'Prevención deadlock','p11'),planned(12,'Memoria','p12')];
const first=ctx.planPuroReconciliacionActividades_(classroom,docs);
assert.deepEqual(first.newClassroom.map(x=>x.number).join(','),'10,11,12,13');
assert.equal(first.renumberDocuments[0].previousNumber,10);
assert.equal(first.renumberDocuments[0].nextNumber,14);
assert.equal(first.renumberDocuments[1].nextNumber,15);
assert.equal(first.renumberDocuments[2].nextNumber,16);
assert.equal(first.duplicatedClassroomNumbers.length,0);
assert.equal(first.renumberDocuments.some(x=>x.documentId==='p3'),false);
assert.equal(first.renumberDocuments.some(x=>x.documentId==='p9'),false);
const synchronized=docs.map(d=>({
 ...d,
 number:d.number>=10?d.number+4:d.number,
 title:ctx.ledgerActividadNumero_(d.number>=10?d.number+4:d.number,
    ctx.actividadNumeroYTextoReconcile_(d.title).text)
}));
const manual=classroom.filter(x=>ctx.actividadNumeroYTextoReconcile_(x.title).number>=10)
 .map(x=>({key:'CW:'+x.id,workId:x.id,origin:'CLASSROOM MANUAL',
 number:ctx.actividadNumeroYTextoReconcile_(x.title).number,title:x.title,
 originalNumber:ctx.actividadNumeroYTextoReconcile_(x.title).number}));
const repeat=ctx.planPuroReconciliacionActividades_(classroom,[...synchronized,...manual]);
assert.equal(repeat.newClassroom.length,0);
assert.equal(repeat.renumberDocuments.length,0,'Rerun after sync cannot shift numbering again');
const later=ctx.planPuroReconciliacionActividades_([...classroom,cw(16,1600,'Manual extra')],[...synchronized,...manual]);
assert.equal(later.newClassroom.length,1);
assert.equal(later.renumberDocuments.find(x=>x.documentId==='p12').nextNumber,17,
  'A new numbered Classroom activity shifts only the next colliding planned Doc');
const ambiguous=ctx.planPuroReconciliacionActividades_([...classroom,cw(10,1001,'Duplicada')],docs);
assert.ok(ambiguous.duplicatedClassroomNumbers.some(x=>x.number===10));
console.log('PASS: Classroom Activity 10-13 imported, planned Activity 10-12 become 14-16, rerun idempotent, duplicate guard.');
