import { useMutation, useQueryClient } from '@tanstack/react-query'
import { todosApi } from '../api/todos'
import { todoKeys } from '../api/queryKeys'

export function useClearCompletedMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: todoKeys.clearCompleted,
    mutationFn: todosApi.clearCompleted,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: todoKeys.list })
    },
  })
}
