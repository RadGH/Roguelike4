import { useCallback, useEffect, useMemo, useRef, useState, useReducer } from 'react'
import { GAME_TITLE } from '../branding'
import { Run } from '../sim/run/run'
import { loadContent } from '../sim/data/loadContent'
import {
  applyRunResult, availableContent, conditionProgress, evaluateUnlocks,
} from '../sim/meta/unlocks'
import { Arena } from './Arena'
import { Intermission, Recap, RunEnd } from './Intermission'
import { PauseMenu } from './PauseMenu'
import { ClassSelect, Codex } from './Codex'
import { loadProfile, storeProfile } from './profile'
import {
  appendHistory, clearSave, exportSave, importSaveFile,
  loadHistory, loadSave, storeSave,
} from './persistence'
import type { RunSave } from '../sim/run/save'
import './app.css'

const registry = loadContent()

export function App(): React.JSX.Element {
  const [run, setRun] = useState<Run | null>(null)
  const [save, setSave] = useState<RunSave | null>(() => loadSave())
  const [profile, setProfile] = useState(() => loadProfile())
  const [screen, setScreen] = useState<'title' | 'classes' | 'codex'>('title')
  const [showHistory, setShowHistory] = useState(false)
  const [playerCount, setPlayerCount] = useState(1)
  const [chosenClasses, setChosenClasses] = useState<string[]>(['student'])
  const [chosenAct, setChosenAct] = useState('act1')
  const [unlockedNow, setUnlockedNow] = useState<string[]>([])
  const [, bump] = useReducer((n: number) => n + 1, 0)
  const onChange = useCallback(() => bump(), [])
  const savedWave = useRef(0)
  const recorded = useRef(false)

  const available = useMemo(() => availableContent(profile, registry), [profile])

  // The run's phase changes inside the Pixi ticker, outside React's view —
  // poll it cheaply so overlays appear the moment the sim settles a wave.
  useEffect(() => {
    if (!run) return
    const id = setInterval(bump, 150)
    return () => clearInterval(id)
  }, [run])

  // Esc (or a pad's Start button, handled in Arena) toggles the pause menu.
  useEffect(() => {
    if (!run) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && run.phase === 'arena') {
        run.paused = !run.paused
        bump()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [run])

  // Save after every wave; on run end fold the result into the profile,
  // evaluate unlocks, archive history, and clear the wave save.
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

        const won = run.phase === 'victory'
        let nextProfile = applyRunResult(profile, {
          actId: run.actId,
          won,
          waveReached: wave,
          players: run.sim.state.players.map((p) => ({
            classId: p.classId,
            kills: run.sim.tracker.killsFor(p.id),
          })),
          bestKillsInOneWave: run.sim.tracker.bestTeamWaveKills(),
          maxSimultaneousBurns: run.sim.maxSimultaneousBurns,
        })
        const earned = evaluateUnlocks(nextProfile, registry)
        nextProfile = {
          ...nextProfile,
          unlockedIds: [...nextProfile.unlockedIds, ...earned.map((u) => u.id)],
        }
        storeProfile(nextProfile)
        setProfile(nextProfile)
        setUnlockedNow(earned.map((u) =>
          `${u.name}: ${u.rewards.map((r) => {
            const reg = r.kind === 'class' ? registry.classes :
              r.kind === 'weapon' ? registry.weapons :
              r.kind === 'act' ? registry.acts : registry.perks
            return reg.get(r.id)?.name ?? r.id
          }).join(', ')}`,
        ))

        appendHistory({
          date: new Date().toISOString().slice(0, 16).replace('T', ' '),
          result: won ? 'victory' : 'defeat',
          waveReached: wave,
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
  }, [run, profile])

  const beginRun = (r: Run): void => {
    savedWave.current = 0
    recorded.current = false
    setUnlockedNow([])
    setRun(r)
  }

  const openClassSelect = (): void => {
    setChosenClasses(Array.from({ length: playerCount }, (_, i) =>
      available.classes.includes(chosenClasses[i]) ? chosenClasses[i] : 'student',
    ))
    setScreen('classes')
  }

  const startRun = (): void => {
    clearSave()
    setSave(null)
    setScreen('title')
    beginRun(new Run(registry, {
      seed: Date.now() >>> 0,
      playerCount,
      actId: available.acts.includes(chosenAct) ? chosenAct : 'act1',
      classIds: chosenClasses,
      unlocked: { weapons: available.weapons, perks: available.perks },
    }))
  }

  const continueRun = (): void => {
    if (!save) return
    beginRun(Run.resume(registry, save, { weapons: available.weapons, perks: available.perks }))
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

  const lockLineFor = (classId: string): string | null => {
    for (const def of registry.unlocks.values()) {
      if (def.rewards.some((r) => r.kind === 'class' && r.id === classId)) {
        return `${def.description} (${conditionProgress(profile, def)})`
      }
    }
    return null
  }

  if (!run) {
    if (screen === 'codex') {
      return <Codex registry={registry} profile={profile} available={available} onClose={() => setScreen('title')} />
    }
    if (screen === 'classes') {
      return (
        <ClassSelect
          registry={registry}
          available={available.classes}
          playerCount={playerCount}
          chosen={chosenClasses}
          onChoose={(pi, id) => setChosenClasses((prev) => {
            const next = [...prev]
            next[pi] = id
            return next
          })}
          onStart={startRun}
          onBack={() => setScreen('title')}
          lockLineFor={lockLineFor}
        />
      )
    }
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
        {available.acts.length > 1 && (
          <div className="toolbar" data-testid="act-select">
            {available.acts.map((id) => (
              <button
                key={id}
                onClick={() => setChosenAct(id)}
                style={chosenAct === id ? { borderColor: 'var(--accent)' } : undefined}
              >
                {registry.acts.get(id)?.name ?? id}
              </button>
            ))}
          </div>
        )}
        <div className="toolbar">
          {save && (
            <button autoFocus onClick={continueRun} data-testid="continue-run">
              Continue — wave {save.nextWave}
            </button>
          )}
          <button autoFocus={!save} onClick={openClassSelect} data-testid="start-run">New run</button>
        </div>
        <div className="toolbar">
          <button onClick={() => setScreen('codex')} data-testid="open-codex">Codex</button>
          {save && <button onClick={() => exportSave(save)}>Export save</button>}
          <label>
            <span className="hint" style={{ cursor: 'pointer' }}>Import save </span>
            <input type="file" accept=".json" onChange={onImport} style={{ display: 'none' }} />
          </label>
          <button onClick={() => setShowHistory((v) => !v)} data-testid="history-toggle">
            Run history
          </button>
          <a href="manual.html" target="_blank" rel="noreferrer">
            <button>Manual</button>
          </a>
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
      {run.paused && run.phase === 'arena' && (
        <PauseMenu run={run} onResume={() => { run.paused = false; onChange() }} />
      )}
      {run.phase === 'recap' && (
        <Recap run={run} onContinue={() => { run.proceedFromRecap(); onChange() }} />
      )}
      {run.phase === 'intermission' && <Intermission run={run} onChange={onChange} />}
      {(run.phase === 'victory' || run.phase === 'defeat') && (
        <RunEnd run={run} unlockedNow={unlockedNow} onRestart={() => setRun(null)} />
      )}
    </>
  )
}
