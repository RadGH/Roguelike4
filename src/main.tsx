import { createRoot } from 'react-dom/client'
import { GAME_TITLE } from './branding'
import { ArenaDebug } from './app/ArenaDebug'

document.title = GAME_TITLE

const root = document.getElementById('root')
if (root) {
  createRoot(root).render(<ArenaDebug />)
}
