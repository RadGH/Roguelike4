import { useCallback, useEffect, useReducer, useState } from 'react'
import { GAME_TITLE } from '../branding'
import { Run } from '../sim/run/run'
import { loadContent } from '../sim/data/loadContent'
import { Arena } from './Arena'
import { Intermission, Recap, RunEnd } from './Intermission'
import './app.css'

export function App(): React.JSX.Element {
  const [run, setRun] = useState<Run | null>(null)
  const [, bump] = useReducer((n: number) => n + 1, 0)
  const onChange = useCallback(() => bump(), [])

  // The run's phase changes inside the Pixi ticker, outside React's view —
  // poll it cheaply so overlays appear the moment the sim settles a wave.
  useEffect(() => {
    if (!run) return
    const id = setInterval(bump, 150)
    return () => clearInterval(id)
  }, [run])

  const startRun = (): void => {
    const registry = loadContent()
    setRun(new Run(registry, {
      seed: Date.now() >>> 0,
      playerCount: 1,
      actId: 'act1',
    }))
  }

  if (!run) {
    return (
      <div className="screen-center">
        <div className="title-name">{GAME_TITLE}</div>
        <div className="hint">Move with WASD, arrows, or a gamepad stick. Weapons fire themselves.</div>
        <button autoFocus onClick={startRun} data-testid="start-run">Start run</button>
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
