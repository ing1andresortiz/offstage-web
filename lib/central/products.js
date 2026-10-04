// Catálogo de OffStage Central. Para añadir un plugin nuevo: copia un bloque, cambia repo y artifacts.
// Las descargas salen del último build en verde de la rama main de cada repo (GitHub Actions).
export const PRODUCTS = [
  {
    id: 'rack',
    kind: 'APP',
    name: 'OffStage Rack',
    tagline: 'Host de plugins en vivo (AU/VST3) para inserts externos de la eMotion LV1 vía SoundGrid. Racks, snapshots por MIDI y alineación de latencia.',
    repo: 'ing1andresortiz/offstage-rack',
    cmakeProject: 'OffStageRack',
    platforms: {
      mac: { artifact: 'OffStage-Rack-mac', label: 'macOS 11+ · Apple Silicon e Intel · .dmg' },
      win: { artifact: 'OffStage-Rack-windows', label: 'Windows 10/11 x64 · instalador + portable (ASIO)' }
    },
    guide: {
      mac: [
        'Descomprime el .zip y abre el .dmg.',
        'Arrastra "OffStage Rack" a Aplicaciones.',
        'Primera vez: clic derecho sobre la app → Abrir → Abrir. Si macOS la bloquea: Ajustes del Sistema → Privacidad y seguridad → "Abrir igualmente".',
        'Si aun así no abre, en Terminal: xattr -dr com.apple.quarantine "/Applications/OffStage Rack.app"',
        'Al abrir: AUDIO (SoundGrid o tu interfaz) y PLUGINS → ESCANEO RÁPIDO.'
      ],
      win: [
        'Descomprime el .zip y ejecuta el instalador "setup.exe" (o usa la versión portable).',
        'Si aparece "Windows protegió su PC": Más información → Ejecutar de todas formas.',
        'AUDIO → tipo ASIO → driver SoundGrid o tu interfaz.',
        'PLUGINS → ESCANEO RÁPIDO. SISTEMA → MODO SHOW antes del show.'
      ]
    }
  },
  {
    id: 'buss',
    kind: 'PLUGIN',
    name: 'OffStage Buss Processor',
    tagline: 'Procesador de master buss: compresor FF/FB, limitador, stereo field, saturación Red/Blue y clipper con ceiling. Latencia de 0 a 6 samples.',
    repo: 'ing1andresortiz/offstage-buss-processor',
    cmakeProject: 'OffStageBuss',
    platforms: {
      mac: { artifact: 'OffStageBussProcessor-macOS', label: 'macOS 11+ · VST3 + AU · instalador .pkg' },
      win: { artifact: 'OffStageBussProcessor-Windows', label: 'Windows 10/11 x64 · VST3' }
    },
    guide: {
      mac: [
        'Descomprime el .zip (y el zip de dentro, si lo hay) y abre "OffStage Buss Processor.pkg".',
        'Si macOS no deja abrirlo: pulsa Aceptar → Ajustes del Sistema → Privacidad y seguridad → "Abrir igualmente" junto al .pkg.',
        'El instalador deja el VST3 y el AU en /Library/Audio/Plug-Ins.',
        'Re-escanea plugins en tu host. Studio One: Opciones → Ubicaciones → Plug-ins VST → "Restablecer lista negra".'
      ],
      win: [
        'Descomprime el .zip.',
        'Copia "OffStage Buss Processor.vst3" a C:\\Program Files\\Common Files\\VST3\\',
        'Re-escanea plugins en tu host (OffStage Rack, AVX o tu DAW).'
      ]
    }
  }
];
