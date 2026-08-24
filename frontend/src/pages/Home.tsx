import { CallHero } from "@/components/CallHero"
import { HomeAgenda } from "@/components/HomeAgenda"
import { useTasks } from "@/hooks/useTasks"

export const HomePage = () => {
  const { tasks, loading, reload } = useTasks()

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col pb-4">
      <CallHero />
      <HomeAgenda tasks={tasks} loading={loading} onChanged={reload} />
    </main>
  )
}
