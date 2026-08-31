import type { Tag } from '../sim/data/tags'

/**
 * Compact tag chips. Element tags carry their element's hue; everything else
 * stays neutral — tag colour never competes with the arena's reserved palette
 * because chips exist only in menus.
 */
const TAG_CLASS: Partial<Record<Tag, string>> = {
  Fire: 'tag-fire',
  Ice: 'tag-ice',
  Lightning: 'tag-lightning',
  Poison: 'tag-poison',
  Void: 'tag-void',
}

export function TagRow({ tags }: { tags: readonly string[] }): React.JSX.Element {
  return (
    <span className="tags">
      {tags.map((t) => (
        <span key={t} className={`tag ${TAG_CLASS[t as Tag] ?? ''}`}>{t}</span>
      ))}
    </span>
  )
}
