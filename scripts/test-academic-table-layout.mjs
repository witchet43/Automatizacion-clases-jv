import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

let opened=0, saved=0, bold=0;
const paragraphs=[];
function makeCell(text){
  const p={alignment:null,setAlignment(a){this.alignment=a;paragraphs.push(a);}};
  return {
    getText(){return text;},getNumChildren(){return 1;},
    getChild(){return {getType(){return 'PARAGRAPH';},asParagraph(){return p;}};},
    editAsText(){return {setBold(value){assert.equal(value,true);bold++;}};},
    setPaddingLeft(x){assert.equal(x,5);},setPaddingRight(x){assert.equal(x,5);},
    setPaddingTop(x){assert.equal(x,5);},setPaddingBottom(x){assert.equal(x,5);}
  };
}
const input=[
 ['Variable','Ejemplo de valor'],
 ['Temperatura del horno','182.5 °C'],
 ['Tiempo de ciclo','46.8 s'],
 ['Proveedor','Proveedor B']
];
const rows=input.map(row=>row.map(makeCell));
const widths=[];
const table={
 getNumRows(){return rows.length;},
 getRow(i){return {getNumCells(){return rows[i].length;},getCell(j){return rows[i][j];}};},
 getCell(i,j){return rows[i][j];},
 setColumnWidth(j,w){widths[j]=w;},
 getColumnWidth(j){return widths[j];}
};
const doc={
 getBody(){return {getTables(){return [table];}};},
 getPageWidth(){return 612;},getMarginLeft(){return 72;},getMarginRight(){return 72;},
 saveAndClose(){saved++;}
};
const sandbox={
 console,DocumentApp:{openById(id){opened++;assert.equal(id,'new-doc');return doc;},
   HorizontalAlignment:{CENTER:'CENTER',LEFT:'LEFT',RIGHT:'RIGHT'},
   ElementType:{PARAGRAPH:'PARAGRAPH'}},
 Utilities:{newBlob(content,mime,name){assert.ok(mime.includes('text/html'));return {content,mime,name};}},
 Drive:{Files:{create(meta,blob){assert.equal(meta.mimeType,'application/vnd.google-apps.document');sandbox.html=blob.content;return {id:'new-doc'};},
 get(){return {id:'new-doc',name:'Ejercicio',mimeType:'application/vnd.google-apps.document',trashed:false,parents:[]};}}},
 html:''
};
vm.createContext(sandbox);
for(const file of ['src/00_PoliticasCanonicas.gs','src/32_TablaAcademicaCanonica.gs','src/31_GoogleDocumentoAcademico.gs'])
 vm.runInContext(fs.readFileSync(file,'utf8'),sandbox,{filename:file});
const expr=x=>vm.runInContext(x,sandbox);
assert.equal(expr('ACADEMIC_POLICY.DOCUMENTS.TABLE_LAYOUT.VERSION'),'ACADEMIC_TABLE_LAYOUT_V1');
const sample='<h1>Ejercicio</h1><table border="1"><tr><th>Variable</th><th>Ejemplo de valor</th></tr>'+
'<tr><td>Temperatura del horno</td><td>182.5 °C</td></tr>'+
'<tr><td>Tiempo de ciclo</td><td>46.8 s</td></tr>'+
'<tr><td>Proveedor</td><td>Proveedor B</td></tr></table>';
sandbox.sample=sample;
const result=expr('crearGoogleDocumentoAcademico_({titulo:"Ejercicio",html:sample,tipo:"MATERIAL"})');
assert.equal(result.id,'new-doc');
assert.equal(result.tableLayout.tables,1);
assert.match(sandbox.html,/<table[^>]*align="center"/i);
assert.ok(widths.length===2);
assert.ok(widths[0]!==widths[1],'Different contents must produce differing widths');
assert.ok(widths.reduce((a,b)=>a+b,0)<=468);
assert.deepEqual(paragraphs.slice(0,2),['CENTER','CENTER']);
assert.equal(paragraphs[3],'RIGHT','Numeric cell must be right aligned');
assert.equal(paragraphs[5],'RIGHT','Numeric with units must be right aligned');
assert.equal(paragraphs[7],'LEFT','Descriptive text must be left aligned');
assert.equal(bold,2);
assert.equal(opened,1,'One Doc read/normalization, no redundant read');
assert.equal(saved,1);
const empty=expr('crearGoogleDocumentoAcademico_({titulo:"Ejercicio",html:"<h1>Ejercicio</h1><p>Texto</p>",tipo:"MATERIAL"})');
assert.equal(empty.tableLayout,null);
assert.equal(opened,1,'Docs with no tables must not pay normalization cost');
assert.throws(()=>expr('normalizarTablasDocumentoAcademico_("other-doc",2)'),/new-doc/);
assert.equal(expr('esValorNumericoTablaAcademica_("Nocturno")'),false);
assert.equal(expr('esValorNumericoTablaAcademica_("480")'),true);
assert.equal(expr('esValorNumericoTablaAcademica_("46.8 s")'),true);
console.log('PASS: ACADEMIC_TABLE_LAYOUT_V1 applied to all new native-table Docs, proportional bounded widths, header emphasis, content alignment, padding, postflight, no extra reads for table-free Docs.');
