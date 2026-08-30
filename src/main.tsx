import { createRoot } from 'react-dom/client'
import { GAME_TITLE } from './branding'
import { App } from './app/App'

document.title = GAME_TITLE

const root = document.getElementById('root')
if (root) {
  createRoot(root).render(<App />)
}
