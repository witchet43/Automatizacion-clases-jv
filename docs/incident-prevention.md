# Controles derivados de incidentes — auditoría de 10 días

Los incidentes observados en Gmail y GitHub Actions se gestionan por causa raíz, no como correos aislados.

## Controles permanentes

- Rutas paralelas, Execution API, replacement deployments y APIs académicas directas: eliminadas y bloqueadas por CI.
- `crearExamenDirecto`: alias canónico permitido explícitamente; generadores específicos continúan prohibidos.
- Bundle/contexto stale y registry drift: el manifiesto es la única fuente de cursos y planeaciones; CI reconstruye el bundle antes de validarlo.
- DocumentApp sin scope: `https://www.googleapis.com/auth/documents` declarado.
- IDs de Google Docs obsoletos: evidencia inaccesible se descarta y se resuelve/recrea idempotentemente; fallos transitorios no provocan duplicados.
- Renderer faltante y tablas con pipes: renderer nativo y conversión a tabla protegidos por regresión.
- PowerShell `New-Object`: guía didáctica determinista.
- Monitor administrativo por minuto: descomisionado; un trigger residual se elimina a sí mismo sin abrir Sheets ni tomar locks.
- Handler legado `evaluarEntregas`: stub de desinstalación incluido si el trigger pertenece a este proyecto.
- Errores transitorios de `CourseWork.list`: reintento acotado solo para lectura; jamás se reintenta una mutación a ciegas.
- 403/404/HTML de autorización: diagnóstico explícito; la verificación post-deploy tolera propagación temporal sin crear una ruta alternativa.
- Límite de versiones Apps Script: capacidad verificada antes de `clasp push`; cambios exclusivos de tests ya no disparan despliegues.
- Duplicación Deploy + Validate: cambios runtime en main se validan dentro de Deploy; Validate queda para PR/manual y cambios de regresiones.

## Límites de plataforma

Un trigger instalado en otro proyecto de Apps Script no puede ser eliminado desde este repositorio. Asimismo, Apps Script mantiene un límite de historial de versiones y la API pública no ofrece borrado masivo seguro. La arquitectura reduce la creación de versiones y detecta capacidad antes de una mutación parcial; el mantenimiento del historial sigue siendo una responsabilidad de plataforma.
