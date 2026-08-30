import { createRoot } from 'react-dom/client'
import { GAME_TITLE } from './branding'
import { Manual } from './site/Manual'

document.title = `${GAME_TITLE} — Manual`

const root = document.getElementById('root')
if (root) {
  createRoot(root).render(<Manual />)
}
