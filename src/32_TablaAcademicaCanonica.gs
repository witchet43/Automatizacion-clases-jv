/**
 * ACADEMIC_TABLE_LAYOUT_V1 - canonical Google Docs table layout.
 * Called only for newly created Google Docs with native tables.
 * No updates to existing documents, student copies or Classroom CourseWork.
 * Google Docs public APIs cannot certify table-block horizontal centering.
 */
function prepararHtmlTablasCanonicas_(html){
  return String(html||'').replace(/<table\b([^>]*)>/gi,function(full,attrs){
    let a=String(attrs||'').replace(/\s+align\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i,'');
    if(!/\bstyle\s*=/i.test(a)){
      a+=' style="margin:8pt auto 10pt auto;border-collapse:collapse;"';
    }
    return '<table'+a+' align="center">';
  });
}

function esValorNumericoTablaAcademica_(text){
  return /^[+-]?\s*[$€]?\s*\d+(?:[.,]\d+)?\s*(?:%|°\s*[CF]|ms|s|min|h|kg|g|km|cm|m)?\s*$/i
    .test(String(text||'').trim());
}

function dimensionesTablaAcademica_(cells,available){
  const cols=cells[0].length;
  const raw=[];
  for(let c=0;c<cols;c++){
    let visible=0;
    for(let r=0;r<cells.length;r++){
      const text=String(cells[r][c]||'').replace(/\s+/g,' ').trim();
      const longest=text.split(' ').reduce(function(mx,t){return Math.max(mx,t.length);},0);
      visible=Math.max(visible,Math.min(38,Math.max(longest,Math.min(25,text.length))));
    }
    raw.push(Math.max(54,Math.min(226,Math.round(visible*5.5+22))));
  }
  const total=raw.reduce(function(s,v){return s+v;},0);
  if(total<=available)return raw;
  const factor=available/total;
  const scaled=raw.map(function(w){return Math.max(5,Math.floor(w*factor));});
  const sum=scaled.reduce(function(s,v){return s+v;},0);
  if(sum>available)scaled[scaled.length-1]=Math.max(5,scaled[scaled.length-1]-(sum-available));
  return scaled;
}

function normalizarTablasDocumentoAcademico_(documentId,expectedCount){
  const policy=ACADEMIC_POLICY.DOCUMENTS.TABLE_LAYOUT;
  if(!policy||policy.VERSION!=='ACADEMIC_TABLE_LAYOUT_V1')
    throw new Error('BLOCKED_TABLE_LAYOUT_POLICY: política ejecutable ausente.');
  const doc=DocumentApp.openById(String(documentId));
  const tables=doc.getBody().getTables();
  if(tables.length!==expectedCount)
    throw new Error('BLOCKED_TABLE_LAYOUT_IMPORT: tablas HTML no coinciden con tablas nativas: '+expectedCount+' vs '+tables.length);
  const page=typeof doc.getPageWidth==='function'?Number(doc.getPageWidth()):612;
  const left=typeof doc.getMarginLeft==='function'?Number(doc.getMarginLeft()):72;
  const right=typeof doc.getMarginRight==='function'?Number(doc.getMarginRight()):72;
  const usable=Number.isFinite(page-left-right)&&page-left-right>100?page-left-right:468;
  const available=Math.min(policy.MAX_WIDTH_PT,usable);
  const report=[];
  tables.forEach(function(table,index){
    const rows=table.getNumRows();
    if(rows<1)throw new Error('BLOCKED_TABLE_LAYOUT_EMPTY: tabla '+(index+1));
    const cols=table.getRow(0).getNumCells();
    if(cols<1)throw new Error('BLOCKED_TABLE_LAYOUT_EMPTY_COLUMNS: tabla '+(index+1));
    const cells=[];
    for(let r=0;r<rows;r++){
      const row=table.getRow(r);
      if(row.getNumCells()!==cols)
        throw new Error('BLOCKED_TABLE_LAYOUT_MERGED: tabla no rectangular '+(index+1));
      const values=[];
      for(let c=0;c<cols;c++)values.push(row.getCell(c).getText());
      cells.push(values);
    }
    const widths=dimensionesTablaAcademica_(cells,available);
    widths.forEach(function(width,c){table.setColumnWidth(c,width);});
    for(let r=0;r<rows;r++){
      for(let c=0;c<cols;c++){
        const cell=table.getCell(r,c);
        cell.setPaddingLeft(policy.PADDING_PT);
        cell.setPaddingRight(policy.PADDING_PT);
        cell.setPaddingTop(policy.PADDING_PT);
        cell.setPaddingBottom(policy.PADDING_PT);
        const header=r===0;
        if(header)cell.editAsText().setBold(true);
        const alignment=header?DocumentApp.HorizontalAlignment.CENTER:
          (esValorNumericoTablaAcademica_(cells[r][c])?
            DocumentApp.HorizontalAlignment.RIGHT:DocumentApp.HorizontalAlignment.LEFT);
        for(let k=0;k<cell.getNumChildren();k++){
          const child=cell.getChild(k);
          if(child.getType()===DocumentApp.ElementType.PARAGRAPH)
            child.asParagraph().setAlignment(alignment);
        }
      }
    }
    widths.forEach(function(w,c){
      const actual=Number(table.getColumnWidth(c));
      if(!Number.isFinite(actual)||Math.abs(actual-w)>2)
        throw new Error('BLOCKED_TABLE_LAYOUT_WIDTH_POSTFLIGHT: tabla '+(index+1)+' columna '+(c+1));
    });
    if(widths.reduce(function(a,b){return a+b;},0)>available+2)
      throw new Error('BLOCKED_TABLE_LAYOUT_OVERFLOW: tabla '+(index+1));
    report.push({table:index+1,columns:cols,widthsPt:widths});
  });
  doc.saveAndClose();
  return {version:policy.VERSION,tables:report.length,verifiedColumns:report,
    centering:'HTML_CENTER_REQUEST_NOT_API_VERIFIABLE'};
}
