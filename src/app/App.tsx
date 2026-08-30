import { useCallback, useEffect, useRef, useState, useReducer } from 'react'
import { GAME_TITLE } from '../branding'
import { Run } from '../sim/run/run'
import { loadContent } from '../sim/data/loadContent'
import { Arena } from './Arena'
import { Intermission, Recap, RunEnd } from './Intermission'
import {
  appendHistory, clearSave, exportSave, importSaveFile,
  loadHistory, loadSave, storeSave,
} from './persistence'
import type { RunSave } from '../sim/run/save'
import './app.css'

export function App(): React.JSX.Element {
  const [run, setRun] = useState<Run | null>(null)
  const [save, setSave] = useState<RunSave | null>(() => loadSave())
  const [showHistory, setShowHistory] = useState(false)
  const [playerCount, setPlayerCount] = useState(1)
  const [, bump] = useReducer((n: number) => n + 1, 0)
  const onChange = useCallback(() => bump(), [])
  const savedWave = useRef(0)
  const recorded = useRef(false)

  // The run's phase changes inside the Pixi ticker, outside React's view —
  // poll it cheaply so overlays appear the moment the sim settles a wave.
  useEffect(() => {
    if (!run) return
    const id = setInterval(bump, 150)
    return () => clearInterval(id)
  }, [run])

  // Save after every wave; archive and clear on run end.
  useEffect(() => {
    if (!run) return
    const id = setInterval(() => {
      const wave = run.sim.state.wave.number
      if ((run.phase === 'recap' || run.phase === 'intermission') && savedWave.current !== wave) {
        savedWave.current = wave
        if (wave < run.sim.lastWaveNumber) {
          storeSave(run.serialize(Date.now() >>> 0))
        }
      }
      if ((run.phase === 'victory' || run.phase === 'defeat') && !recorded.current) {
        recorded.current = true
        clearSave()
        setSave(null)
        appendHistory({
          date: new Date().toISOString().slice(0, 16).replace('T', ' '),
          result: run.phase === 'victory' ? 'victory' : 'defeat',
          waveReached: run.sim.state.wave.number,
          players: run.sim.state.players.map((p) => ({
            id: p.id,
            level: p.level,
            kills: run.sim.tracker.killsFor(p.id),
            dealt: Math.round(run.sim.tracker.totalFor(p.id)),
            topSources: [...run.sim.tracker.bySource(p.id).entries()]
              .sort((a, b) => b[1] - a[1])
              .slice(0, 3)
              .map(([k, v]) => [k, Math.round(v)] as [string, number]),
          })),
        })
      }
    }, 300)
    return () => clearInterval(id)
  }, [run])

  const beginRun = (r: Run): void => {
    savedWave.current = 0
    recorded.current = false
    setRun(r)
  }

  const startRun = (): void => {
    clearSave()
    setSave(null)
    beginRun(new Run(loadContent(), {
      seed: Date.now() >>> 0,
      playerCount,
      actId: 'act1',
    }))
  }

  const continueRun = (): void => {
    if (!save) return
    beginRun(Run.resume(loadContent(), save))
  }

  const onImport = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0]
    if (!file) return
    void importSaveFile(file).then((imported) => {
      if (imported) {
        storeSave(imported)
        setSave(imported)
      }
    })
    e.target.value = ''
  }

  if (!run) {
    const history = showHistory ? loadHistory() : []
    return (
      <div className="screen-center">
        <div className="title-name">{GAME_TITLE}</div>
        <div className="hint">Move with WASD, arrows, or a gamepad stick. Weapons fire themselves.</div>
        <div className="toolbar" data-testid="player-count">
          {[1, 2, 3, 4].map((n) => (
            <button
              key={n}
              onClick={() => setPlayerCount(n)}
              style={playerCount === n ? { borderColor: 'var(--accent)' } : undefined}
            >
              {n} player{n > 1 ? 's' : ''}
            </button>
          ))}
        </div>
        {playerCount > 1 && (
          <div className="hint">Player 1: keyboard · players 2–{playerCount}: gamepads in order</div>
        )}
        <div className="toolbar">
          {save && (
            <button autoFocus onClick={continueRun} data-testid="continue-run">
              Continue — wave {save.nextWave}
            </button>
          )}
          <button autoFocus={!save} onClick={startRun} data-testid="start-run">New run</button>
        </div>
        <div className="toolbar">
          {save && <button onClick={() => exportSave(save)}>Export save</button>}
          <label>
            <span className="hint" style={{ cursor: 'pointer' }}>Import save </span>
            <input type="file" accept=".json" onChange={onImport} style={{ display: 'none' }} />
          </label>
          <button onClick={() => setShowHistory((v) => !v)} data-testid="history-toggle">
            Run history
          </button>
        </div>
        {showHistory && (
          <div className="panel" data-testid="history">
            {history.length === 0 && <div className="hint">No completed runs yet.</div>}
            {history.map((h, i) => (
              <div className="recap-row" key={i}>
                <span>{h.date}</span>
                <span>{h.result === 'victory' ? 'Victory' : `Fell on wave ${h.waveReached}`}</span>
                <span>
                  {h.players.map((p) =>
                    `P${p.id + 1} lv${p.level} · ${p.kills} kills` +
                    (p.topSources[0] ? ` · mostly ${p.topSources[0][0]}` : ''),
                  ).join('  ')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <>
      <Arena run={run} />
      {run.phase === 'recap' && (
        <Recap run={run} onContinue={() => { run.proceedFromRecap(); onChange() }} />
      )}
      {run.phase === 'intermission' && <Intermission run={run} onChange={onChange} />}
      {(run.phase === 'victory' || run.phase === 'defeat') && (
        <RunEnd run={run} onRestart={() => setRun(null)} />
      )}
    </>
  )
}
