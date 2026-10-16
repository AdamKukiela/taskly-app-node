import { Alert, Button } from '../../../design-system'
import { useClearCompletedMutation } from '../hooks/useClearCompletedMutation'

export function ClearCompletedButton({
  disabled,
  onCleared,
}: {
  disabled: boolean
  onCleared: (count: number) => void
}) {
  const clearCompleted = useClearCompletedMutation()
  const pending = disabled || clearCompleted.isPending

  function clear() {
    if (pending) return
    clearCompleted.mutate(undefined, {
      onSuccess: ({ deletedCount }) => onCleared(deletedCount),
    })
  }

  return (
    <div className="stack compact">
      <Button variant="secondary" disabled={pending} onClick={clear}>
        {clearCompleted.isPending ? 'Clearing…' : 'Clear completed'}
      </Button>
      {clearCompleted.error && (
        <Alert variant="warning">{clearCompleted.error.message}</Alert>
      )}
    </div>
  )
}
