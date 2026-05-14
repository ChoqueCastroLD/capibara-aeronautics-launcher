# Capibara Aeronautics Launcher

Launcher de Electron para el modpack **Capibara Aeronautics SMP** (Minecraft 1.21.1 + NeoForge 21.1.228). Permite instalar, actualizar y lanzar el modpack sin configuración manual, con autenticación offline.

## Características

- Instalación automática de Java 21, NeoForge y el modpack
- Auto-detección de GPUs (dedicada / integrada) y preferencia por registro de Windows
- Verificación de nueva versión contra el repo `aeronautics-modpack-versions`
- Modo offline (UUID derivado del nombre de usuario, sin cuenta Mojang)
- Mapa del servidor embebido (dynmap)
- Skin del jugador renderizada en cabeza 3D (mc-heads.net) con caché local
- Discord Rich Presence opcional
- Tema claro / oscuro

## Compilar localmente

Requisitos: Node.js 18+, Windows con Modo Desarrollador activado.

```bash
npm install
npm run build
```

El `.exe` portable se genera en `dist/CapibaraAeronauticsLauncher.exe`.

> **Nota:** el archivo `resources/modpack.mrpack` (~270 MB) está excluido del repo por tamaño. Para builds locales, descárgalo desde el [release más reciente del repo de versiones](https://github.com/ChoqueCastroLD/aeronautics-modpack-versions/releases) y colócalo en `resources/`.

## Configuración opcional

- **Discord RPC**: define `DISCORD_APP_ID` como variable de entorno antes de lanzar el launcher, o edita `src/launcher/discord.js`.

## Licencia

MIT — ver [LICENSE](LICENSE).
