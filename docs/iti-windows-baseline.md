# Introducción a las Tecnologías de Información — baseline obligatorio de entorno Windows

## Alcance

Esta política aplica a **todo material nuevo dirigido al alumno** de Introducción a las Tecnologías de Información: clase, tarea previa, actividad, práctica, quiz/instrucciones, Google Doc, Gamma, notas docentes de Notion y cualquier recurso que describa trabajo práctico.

Los recursos históricos ya publicados **se dejan como están**. No se reescriben, renombran ni republican solo para alinearlos retroactivamente con esta política.

## Entorno asumido

El diseño debe asumir exactamente:

- el alumno dispone de **una computadora con Windows**;
- no se presupone laboratorio especializado;
- no se presupone un segundo sistema operativo;
- toda evidencia solicitada debe poder obtenerse en Windows;
- toda herramienta obligatoria debe funcionar en Windows;
- cuando una herramienta externa sea opcional, debe existir una alternativa compatible con Windows.

## Prohibiciones para trabajo práctico

Nunca pedir como requisito del alumno:

- instalar o usar Linux, Ubuntu u otro sistema operativo;
- usar WSL como entorno obligatorio;
- usar una máquina virtual;
- usar dual boot;
- producir evidencia desde un sistema operativo distinto de Windows;
- ejecutar dos sistemas operativos para compararlos;
- depender de un laboratorio con varios sistemas operativos.

## Otros sistemas operativos

Se pueden mencionar Windows Server, Linux, Android, macOS, sistemas embebidos u otros **solo como ejemplos conceptuales** cuando el programa lo requiera.

Una mención conceptual puede servir para explicar clasificación, historia, licencias, familias o casos de uso. No puede convertirse en instrucción de instalación, ejecución, captura de evidencia o comparación práctica.

## Regla de diseño

Antes de crear cualquier material, responder afirmativamente estas cinco preguntas:

1. ¿La actividad completa puede resolverse en una sola computadora con Windows?
2. ¿Toda evidencia requerida puede producirse en Windows?
3. ¿No requiere WSL, Linux, Ubuntu, VM, dual boot ni segundo sistema operativo?
4. Si se mencionan otros sistemas operativos, ¿son únicamente ejemplos conceptuales?
5. Si se usa software externo, ¿funciona en Windows y existe una alternativa compatible con Windows cuando sea opcional?

Si cualquiera es **NO**, el material debe rediseñarse antes de crearse.

## Herramientas preferidas

Cuando sean suficientes para el objetivo didáctico, preferir herramientas nativas o estándar de Windows, por ejemplo:

- Configuración de Windows;
- Administrador de tareas;
- Monitor de recursos;
- Explorador de archivos;
- Administrador de dispositivos;
- `winver`;
- `msinfo32`;
- Windows Terminal;
- PowerShell;
- herramientas Microsoft que funcionen directamente en Windows.

No usar comandos de otro sistema operativo como evidencia requerida.

## Ejemplos inequívocos

**Correcto:** “Clasifica Windows como sistema de escritorio, multitarea y de propósito general; justifica con evidencia observable.”

**Correcto:** “Menciona conceptualmente Linux como ejemplo de una familia de sistemas operativos de propósito general.”

**Incorrecto:** “Ejecuta la misma tarea en Windows y Linux.”

**Incorrecto:** “Instala WSL/Ubuntu para comparar comandos.”

**Incorrecto:** “Usa una VM Linux si tu equipo solo tiene Windows.”

**Incorrecto:** “Entrega capturas equivalentes de Windows y Linux.”

## Fuente de verdad

La versión ejecutable de esta política vive en:

`config/academic-context.json → courses.introduccion-tecnologias-informacion.studentEnvironmentProfile`

Los documentos narrativos deben coincidir con ese perfil. Si existe contradicción, se bloquea el diseño hasta reconciliarla.
