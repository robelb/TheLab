import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { defineConfig, loadEnv, searchForWorkspaceRoot } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/** Git metadata, best-effort — a build from a tarball or CI without .git still works. */
function git(command: string): string {
  try {
    return execSync(`git ${command}`, {
      cwd: __dirname,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim()
  } catch {
    return ''
  }
}

function appVersion(): string {
  try {
    const pkg = readFileSync(path.resolve(__dirname, 'package.json'), 'utf8')
    return (JSON.parse(pkg) as { version?: string }).version ?? '0.0.0'
  } catch {
    return '0.0.0'
  }
}

/**
 * Which environment this build is *for*, as opposed to how Vite built it.
 * `VITE_APP_ENV` wins when set (so a host's build env can label a deploy);
 * otherwise only a plain production build counts as production — running the
 * dev server or building `--mode testing` both mean someone is testing.
 */
function appEnv(mode: string, override?: string): string {
  if (override) return override
  return mode === 'production' ? 'production' : 'testing'
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiUrl = env.VITE_API_URL || 'http://localhost:3001'

  // Stamped once, when the bundle is built — this is what identifies the build
  // a tester is actually looking at, regardless of what's on anyone's machine.
  const buildInfo = {
    __APP_VERSION__: JSON.stringify(appVersion()),
    __GIT_SHA__: JSON.stringify(git('rev-parse --short HEAD')),
    __GIT_DIRTY__: JSON.stringify(git('status --porcelain') !== ''),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __BUILD_MODE__: JSON.stringify(mode),
    __APP_ENV__: JSON.stringify(appEnv(mode, env.VITE_APP_ENV)),
  }

  return {
    plugins: [react(), tailwindcss()],
    define: buildInfo,
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      fs: {
        // The placement canvas loads its faces straight from the backend's
        // `assets/fonts`, so editor and mockup share one set of files — see
        // `src/components/canvas/placement-fonts.css`.
        allow: [
          searchForWorkspaceRoot(process.cwd()),
          path.resolve(__dirname, '../backend/assets/fonts'),
        ],
      },
      proxy: {
        '/api': {
          target: apiUrl,
          changeOrigin: true,
        },
      },
    },
  }
})
