# RMN Santojanni — PWA de Agenda

Aplicación web progresiva (PWA) para la gestión de turnos del Servicio de Resonancia Magnética del Hospital Donación Francisco Santojanni.

## Estructura del proyecto

```
resonancia-pwa/
├── index.html              ← App principal
├── manifest.json           ← Configuración PWA
├── sw.js                   ← Service worker (hace la app instalable)
├── css/
│   └── app.css             ← Estilos
├── js/
│   ├── config.js           ← Configuración y localStorage
│   ├── api.js              ← Capa de comunicación con Apps Script
│   ├── app.js              ← Controlador principal
│   └── views/
│       ├── agenda.js       ← Vista grilla semanal (administrativo)
│       ├── lista.js        ← Vista lista del día (técnico)
│       └── turno.js        ← Formulario de asignación + buscador
├── icons/
│   ├── icon-192.png        ← Ícono PWA (generar con cualquier editor)
│   └── icon-512.png
└── apps-script/
    └── WebAPI.gs           ← Código a agregar en Apps Script
```

## Setup: Apps Script

1. Abrir el Google Sheet → **Extensiones → Apps Script**
2. Hacer clic en **+** junto a "Archivos" → "Nuevo archivo de secuencia de comandos"
3. Nombrar el archivo `WebAPI` (sin extensión)
4. Pegar el contenido de `apps-script/WebAPI.gs`
5. Guardar (Ctrl+S)
6. **Implementar → Administrar implementaciones → Nueva implementación**
   - Tipo: **Aplicación web**
   - Ejecutar como: **Yo (mi cuenta)**
   - Quién tiene acceso: **Cualquier persona**
7. Copiar la URL generada (termina en `/exec`)

> ⚠️ Si se modifica el código del Apps Script y se reimplementa, la URL puede cambiar. En ese caso actualizar la URL en la PWA desde la pantalla de configuración.

## Setup: Íconos

Crear dos íconos PNG para la PWA:
- `icons/icon-192.png` (192×192 px)
- `icons/icon-512.png` (512×512 px)

Se puede usar cualquier editor de imagen o generadores online como [favicon.io](https://favicon.io).

## Deploy: GitHub Pages

1. Crear repositorio en la cuenta de la jefatura de resonancia
2. Subir todos los archivos (excepto la carpeta `apps-script/`)
3. En el repositorio → **Settings → Pages**
4. Source: **Deploy from a branch** → rama `main` → carpeta `/` (root)
5. GitHub genera automáticamente una URL del tipo `https://usuario.github.io/repositorio/`

## Primer uso

1. Abrir la URL en el navegador
2. Ingresar la URL del Apps Script cuando se solicite
3. Elegir rol (Administrativo o Técnico)
4. En Chrome/Edge: aparece el banner "Instalar aplicación" → aceptar para instalar como PWA

## Vistas

### Administrativo — Agenda semanal
- Grilla de 7 días con horarios de 07:00 a 22:00
- Celdas coloreadas por tipo (turno / bloqueo / franja)
- Clic en celda libre → abre formulario de asignación con fecha/hora prellenos
- Tooltip con datos del paciente al pasar el mouse sobre un turno

### Técnico — Lista del día
- Tabla cronológica con todos los turnos del día
- Botón **Presente** en cada fila
- Filtro en tiempo real por nombre o DNI
- Navegación entre días

### Nuevo turno (ambos roles)
- Formulario completo con lista de estudios desde Config
- Botón "Ver horarios disponibles" → consulta disponibilidad real respetando todas las restricciones del sheet
- Chips de horario disponibles → clic para seleccionar → confirmar

### Buscar turno
- Búsqueda por apellido y/o DNI
- Muestra historial con estado (Activo / Anulado / Modificado)
- Opción de anular desde el resultado

## Colores de origen

| Origen      | Color    |
|-------------|----------|
| AMBULATORIO | Verde    |
| INTERNACIÓN | Amarillo |
| GUARDIA     | Azul     |
| DIRECCIÓN   | Violeta  |
| TRASLADO    | Celeste  |

## Notas técnicas

- La app funciona **sin framework** (vanilla JS + CSS puro)
- Los datos se guardan únicamente en el Google Sheet original
- La URL del servidor se guarda en `localStorage` del navegador
- El service worker cachea los archivos estáticos para uso offline parcial
- Las llamadas POST usan `Content-Type: text/plain` para evitar preflight CORS
