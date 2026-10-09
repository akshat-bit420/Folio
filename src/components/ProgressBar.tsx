import styles from './ProgressBar.module.css'

export function ProgressBar({ value }: { value: number }) {
  const width = Math.min(100, Math.max(0, value))
  return (
    <div className={styles.track} aria-hidden="true">
      <span className={styles.fill} style={{ width: `${width}%` }} />
    </div>
  )
}
