# Notas de clase en Notion — contrato canónico

## Propósito

Toda generación de clase completa debe terminar con una nota docente canónica en Notion. La nota es material del profesor para exponer la sesión; no sustituye Gamma, Classroom ni los documentos de los alumnos.

## Ruta canónica

`recursos Google → Gamma canónica verificada → Notion Notes → postflight resolverClase`

La raíz es **Notas de clase**. Cada materia tiene exactamente una página padre configurada en `config/academic-context.json`. Cada sesión tiene como máximo una nota canónica hija.

## Identidad e idempotencia

El título de la nota es exactamente el tema/subtema canónico de la sesión. Antes de crear:
1. resolver la página padre de la materia desde el manifest;
2. buscar el título/tema en Notion;
3. comprobar el parent real;
4. si existe exactamente una nota canónica, reutilizar o actualizar;
5. si no existe, crear;
6. si existen varias candidatas canónicas, bloquear y reconciliar; nunca duplicar.

La planeación no acredita la existencia de Notion. La verificación real se hace con el conector Notion y se entrega a `resolverClase` como `options.notionLiveEvidence[sesion]` con `source: NOTION_LIVE_CONNECTOR`.

## Contenido mínimo obligatorio

### Objetivo de la clase
Objetivo docente concreto alineado con el tema.

### Guion para exponer
Desarrollo explicativo útil para que el profesor imparta la clase. Debe profundizar conceptos, ejemplos, relaciones, matices y aclaraciones; no copiar simplemente las diapositivas.

### Preguntas útiles
Preguntas para activar, comprobar o profundizar durante la exposición.

### Errores conceptuales a corregir
Confusiones previsibles y cómo reconducirlas.

### Transición a la actividad
Conectar explícitamente con la Actividad/Práctica real cuando exista, usando su nombre canónico.

### Cierre
Idea de síntesis y pregunta o mensaje final.

### Preparación siguiente
Conectar con la tarea o preparación de la siguiente sesión si existe.

### Conceptos clave
Vocabulario y nociones que el docente debe remarcar.

Cuando Gamma aplica, incluir **Gamma de referencia** con la URL canónica verificada.

## Verificación posterior

Después de crear o actualizar, volver a hacer `fetch` de la página. Solo puede emitirse `LIVE_CANONICAL` si:
- el título coincide exactamente con el tema canónico;
- el parent corresponde a la materia;
- el contenido fue leído;
- están las secciones obligatorias;
- cuando Gamma aplica, la nota referencia la Gamma canónica;
- la búsqueda encontró exactamente una nota canónica.

Estados: `LIVE_CANONICAL`, `LIVE_NON_CANONICAL`, `LIVE_NOT_FOUND`, `LIVE_INACCESSIBLE`.

Decisiones de `resolverClase`: `REUSE`, `CREATE`, `REPAIR_OR_REVIEW`, `BLOCK`, `VERIFY_LIVE`.

Una clase sin notas Notion LIVE canónicas no puede declararse paquete preparado.
