import styles from './EmptyState.module.css'

type EmptyStateProps = {
  title: string
  action?: {
    label: string
    onClick: () => void
  }
}

export function EmptyState({ title, action }: EmptyStateProps) {
  return (
    <div className={styles.wrap}>
      <p className={styles.title}>{title}</p>
      {action ? (
        <button type="button" className={styles.action} onClick={action.onClick}>
          {action.label}
        </button>
      ) : null}
    </div>
  )
}
