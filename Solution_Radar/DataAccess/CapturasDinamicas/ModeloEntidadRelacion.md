# Modelo entidad-relación — Captura Dinámica

16 tablas en el esquema `portal` con prefijo `capturadinamica_`: 6 catálogos (`tc_`) y 10 de proceso (`tp_`).
Las crea `Script_CapturaDinamica.sql`.

## Diagrama

Línea continua = llave foránea real. Línea punteada = relación lógica por `Clave` (la resuelve el código).
No se incluye `tc_menu` porque no se relaciona con otras tablas.

```mermaid
erDiagram
    tp_encuesta ||--o{ tp_encuestaversion : "tiene versiones"
    tc_estatus ||--o{ tp_encuestaversion : "estatus"
    tp_encuestaversion ||--o{ tp_segmentacion : "quien responde"
    tc_tiposegmento ||--o{ tp_segmentacion : "tipo"
    tp_encuestaversion ||--o{ tp_pregunta : "contiene"
    tc_tipopregunta ||--o{ tp_pregunta : "tipo"
    tp_pregunta ||--o{ tp_preguntaopcion : "opciones, filas, columnas"
    tp_pregunta ||--o{ tp_niveldependiente : "niveles"
    tp_pregunta ||--o{ tp_opciondependiente : "opciones encadenadas"
    tp_opciondependiente |o..o{ tp_opciondependiente : "ClavePadre"
    tp_pregunta ||--o{ tp_reglacondicional : "reglas"
    tc_operador ||--o{ tp_reglacondicional : "operador"
    tc_accionregla ||--o{ tp_reglacondicional : "accion"
    tp_reglacondicional }o..o| tp_pregunta : "ClavePreguntaDestino"
    tp_encuestaversion ||--o{ tp_respuestaencuesta : "respuestas"
    tp_respuestaencuesta ||--o{ tp_respuestapregunta : "valores"
    tp_respuestapregunta }o..|| tp_pregunta : "ClavePregunta"
    tp_respuestapregunta }o..o| tp_preguntaopcion : "ClaveOpcion / ClaveFila"

    tp_encuesta {
        int IdEncuesta PK
        nvarchar Nombre
        nvarchar Descripcion
        bit Activo
        datetime FechaModificacion
        nvarchar NombreEmpleadoModifica
    }
    tp_encuestaversion {
        int IdVersion PK
        int IdEncuesta FK
        int NumeroVersion "unico por encuesta"
        tinyint IdEstatus FK
        date FechaInicio
        date FechaCierre
        bit RespuestaUnica
        bit Anonima
        bit RequiereAutenticacion
        nvarchar MensajeInicial
        nvarchar MensajeFinal
        int PoblacionObjetivo
    }
    tp_segmentacion {
        int IdSegmentacion PK
        int IdVersion FK
        tinyint IdTipoSegmento FK
        nvarchar Valor
    }
    tp_pregunta {
        int IdPregunta PK
        int IdVersion FK
        varchar Clave "estable entre versiones"
        int Orden
        tinyint IdTipoPregunta FK
        nvarchar Texto
        bit Obligatoria
        bit PermitirOtro
        int MinCaracteres
        int MaxCaracteres
        int MinSelecciones
        int MaxSelecciones
        bit PermitirCalendario
        bit EsLlave
    }
    tp_preguntaopcion {
        int IdOpcion PK
        int IdPregunta FK
        varchar Clave
        char TipoOpcion "O opcion, F fila, C columna"
        nvarchar Texto
        int Orden
    }
    tp_niveldependiente {
        int IdNivel PK
        int IdPregunta FK
        tinyint Nivel
        nvarchar Nombre
        bit PermitirMultiple
    }
    tp_opciondependiente {
        int IdOpcionDependiente PK
        int IdPregunta FK
        varchar Clave
        tinyint Nivel
        varchar ClavePadre "opcion del nivel anterior"
        nvarchar Texto
    }
    tp_reglacondicional {
        int IdRegla PK
        int IdPregunta FK
        tinyint IdOperador FK
        nvarchar Valor "clave de opcion o literal"
        tinyint IdAccion FK
        varchar ClavePreguntaDestino
    }
    tp_respuestaencuesta {
        bigint IdRespuesta PK
        int IdVersion FK
        varchar NumEmpleado
        nvarchar NombreEmpleado
        datetime FechaRespuesta
    }
    tp_respuestapregunta {
        bigint IdRespuestaPregunta PK
        bigint IdRespuesta FK
        varchar ClavePregunta
        varchar ClaveOpcion
        varchar ClaveFila
        nvarchar ValorTexto
        decimal ValorNumero
        date ValorFecha
    }
    tc_estatus {
        tinyint IdEstatus PK
        varchar Clave "Borrador Publicada Cerrada Archivada"
    }
    tc_tipopregunta {
        tinyint IdTipoPregunta PK
        varchar Clave "unica multiple texto ..."
        bit UsaOpciones
    }
    tc_operador {
        tinyint IdOperador PK
        varchar Clave "igual distinto contiene mayor menor"
    }
    tc_accionregla {
        tinyint IdAccion PK
        varchar Clave "mostrar ocultar irA finalizar"
    }
    tc_tiposegmento {
        tinyint IdTipoSegmento PK
        varchar Clave "Puesto Segmento Region Sucursal Usuario"
    }
```

## Cómo funciona

### Tres bloques
- **Catálogos (`tc_`)**: valores fijos que el código conoce por su `Clave`.
- **Definición (`tp_`, versionada)**: encuesta → versiones → preguntas con opciones, niveles dependientes, reglas y segmentación.
- **Respuestas (`tp_`)**: una fila por persona en `tp_respuestaencuesta` y una fila por valor en `tp_respuestapregunta`.

### Id para la base, Clave para el negocio
Las tablas de definición tienen un `Id` numérico (llave primaria, distinto en cada versión) y una `Clave`
que **no cambia** al copiar la pregunta a una versión nueva. Reglas, opciones dependientes y respuestas
apuntan a la `Clave`. Así una versión nueva copia sus preguntas sin romper la lógica, y las respuestas
de distintas versiones se pueden comparar o recuperar con el campo llave. Por eso esas relaciones son
lógicas (punteadas) y no llaves foráneas: la `Clave` es única solo dentro de una versión.

### Versionado
1. Crear encuesta → `tp_encuesta` + versión 1 en Borrador.
2. Guardar una versión **sin respuestas** → se reemplaza su contenido (DELETE + INSERT en transacción).
3. Guardar una versión **con respuestas** → se crea la versión siguiente (o se actualiza el borrador existente); la anterior queda como histórico.
4. Publicar → la publicada anterior pasa a Archivada. El índice `UX_cd_version_publicada` permite solo una publicada por encuesta.
5. Cada respuesta queda ligada a la versión exacta que se contestó.

### Respuestas (modelo dinámico)
| Tipo | Columnas que se llenan |
|---|---|
| Opción única, Sí/No, Desplegable | `ClaveOpcion` |
| Selección múltiple, Dependiente | `ClaveOpcion` (una fila por opción elegida) |
| «Otro» | `ClaveOpcion = '__otro'` + `ValorTexto` |
| Texto libre | `ValorTexto` |
| Número, Escala | `ValorNumero` |
| Fecha | `ValorFecha` (+ `ValorTexto` con la hora si se pidió para Outlook) |
| Matriz | `ClaveFila` + `ClaveOpcion` (columna), una fila por renglón |

Las preguntas ocultas por la lógica condicional no generan filas. Un tipo de pregunta nuevo no requiere columnas nuevas.

### Lógica condicional
`tp_reglacondicional`: SI la respuesta `Operador` `Valor` ENTONCES `Accion` `ClavePreguntaDestino`.
`Valor` es la `Clave` de una opción o un valor literal. La lógica se evalúa en el navegador al capturar.

### Campo llave
La pregunta con `EsLlave = 1` permite buscar la última captura con el mismo valor en todas las versiones
de la encuesta. En resultados se cuenta solo la última captura de cada valor.
