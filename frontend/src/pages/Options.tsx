import { type ChangeEvent, type FormEvent, useRef, useState } from "react"
import {
  AudioLines,
  Camera,
  ChevronRight,
  KeyRound,
  LogOut,
  Mail,
  Mic,
  Palette,
  Save,
  UserPlus,
  UserRound,
} from "lucide-react"
import { BusyDots, BusyOverlay } from "@/components/BusyState"
import { FieldLabel } from "@/components/FieldLabel"
import { ThemePicker } from "@/components/ThemePicker"
import { VoicePicker } from "@/components/VoicePicker"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { PwaUpdateRow } from "@/components/PwaUpdate"
import { createAccount, updateProfile, uploadAvatar } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { isIos, isStandalone, openIosAppSettings } from "@/lib/pwa"

const initials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")

type OptionsSheet = "profile" | "voice" | "theme" | "account" | null

export const OptionsPage = () => {
  const { logout } = useAuth()
  const [sheet, setSheet] = useState<OptionsSheet>(null)

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-6 px-5 pt-[calc(var(--k-safe-area-top)+2rem)]">
      <h1 className="text-3xl font-semibold tracking-tight">Ajustes</h1>

      <div className="grid gap-2">
        <OptionsRow
          icon={UserRound}
          title="Perfil"
          hint="Nombre, correo y foto"
          onClick={() => setSheet("profile")}
        />
        <OptionsRow
          icon={AudioLines}
          title="Voz"
          hint="La voz de EC"
          onClick={() => setSheet("voice")}
        />
        <OptionsRow
          icon={Palette}
          title="Tema"
          hint="Claro, oscuro o fondo"
          onClick={() => setSheet("theme")}
        />
        <OptionsRow
          icon={UserPlus}
          title="Crear cuenta"
          hint="Nombre, correo y contraseña"
          onClick={() => setSheet("account")}
        />
        {isIos() && isStandalone() ? (
          <OptionsRow
            icon={Mic}
            title="Micrófono"
            hint="Ajustes del iPhone → Agenda → Permitir"
            onClick={() => openIosAppSettings()}
          />
        ) : null}
        <PwaUpdateRow />
      </div>

      <Button type="button" variant="destructive" className="glass-danger h-11 border" onClick={logout}>
        <LogOut data-icon="inline-start" />
        Cerrar sesión
      </Button>

      <Sheet open={sheet === "profile"} onOpenChange={(open) => !open && setSheet(null)}>
        <SheetContent
          side="bottom"
          className="z-80 max-h-[88vh] gap-0 overflow-y-auto rounded-t-[1.75rem] pb-[calc(var(--k-safe-area-bottom)+1.25rem)]"
        >
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <UserRound className="size-4" />
              Perfil
            </SheetTitle>
            <SheetDescription>Nombre, correo y foto</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-2">
            <ProfileForm />
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={sheet === "voice"} onOpenChange={(open) => !open && setSheet(null)}>
        <SheetContent
          side="bottom"
          className="z-80 max-h-[88vh] gap-0 overflow-y-auto rounded-t-[1.75rem] pb-[calc(var(--k-safe-area-bottom)+1.25rem)]"
        >
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <AudioLines className="size-4" />
              Voz
            </SheetTitle>
            <SheetDescription>Elige la voz con la que te habla EC.</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-2">
            <VoicePicker />
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={sheet === "theme"} onOpenChange={(open) => !open && setSheet(null)}>
        <SheetContent
          side="bottom"
          className="z-80 gap-0 rounded-t-[1.75rem] pb-[calc(var(--k-safe-area-bottom)+1.25rem)]"
        >
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Palette className="size-4" />
              Tema
            </SheetTitle>
            <SheetDescription>Claro, oscuro o un fondo personalizado.</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-2">
            <ThemePicker />
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={sheet === "account"} onOpenChange={(open) => !open && setSheet(null)}>
        <SheetContent
          side="bottom"
          className="z-80 max-h-[88vh] gap-0 overflow-y-auto rounded-t-[1.75rem] pb-[calc(var(--k-safe-area-bottom)+1.25rem)]"
        >
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <UserPlus className="size-4" />
              Crear cuenta
            </SheetTitle>
            <SheetDescription>Nombre, correo y contraseña</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-2">
            <CreateAccountForm />
          </div>
        </SheetContent>
      </Sheet>
    </main>
  )
}

const OptionsRow = ({
  icon: Icon,
  title,
  hint,
  onClick,
}: {
  icon: typeof UserRound
  title: string
  hint: string
  onClick: () => void
}) => (
  <button
    type="button"
    className="flex items-center gap-3 rounded-3xl border bg-card px-4 py-3.5 text-left shadow-sm transition-colors hover:bg-muted/40"
    onClick={onClick}
  >
    <span className="flex size-11 items-center justify-center rounded-2xl bg-muted text-foreground">
      <Icon className="size-5" />
    </span>
    <span className="min-w-0 flex-1">
      <span className="block font-medium">{title}</span>
      <span className="text-sm text-muted-foreground">{hint}</span>
    </span>
    <ChevronRight className="size-4 text-muted-foreground" />
  </button>
)

const ProfileForm = () => {
  const { user, setUser } = useAuth()
  const fileRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState(user?.name ?? "")
  const [email, setEmail] = useState(user?.email ?? "")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  if (!user) {
    return null
  }

  const onPickPhoto = () => fileRef.current?.click()

  const onPhotoChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) {
      return
    }
    setError(null)
    setNotice(null)
    const previewUrl = URL.createObjectURL(file)
    setPreview(previewUrl)
    setUploading(true)
    try {
      const data = await uploadAvatar(file)
      setUser(data.user)
      setNotice("Foto de perfil actualizada")
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo subir la foto")
    } finally {
      URL.revokeObjectURL(previewUrl)
      setPreview(null)
      setUploading(false)
    }
  }

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setNotice(null)

    const nextName = name.trim()
    const nextEmail = email.trim().toLowerCase()
    if (!nextName) {
      setError("El nombre es obligatorio")
      return
    }
    if (!nextEmail) {
      setError("El correo es obligatorio")
      return
    }
    if (newPassword && newPassword !== confirmPassword) {
      setError("La nueva contraseña no coincide")
      return
    }
    if (newPassword && newPassword.length < 8) {
      setError("La nueva contraseña debe tener al menos 8 caracteres")
      return
    }

    setSaving(true)
    try {
      const data = await updateProfile({
        name: nextName,
        email: nextEmail,
        ...(newPassword ? { newPassword } : {}),
      })
      if (data.token) {
        localStorage.setItem("token", data.token)
      }
      setUser(data.user)
      setNewPassword("")
      setConfirmPassword("")
      setNotice("Perfil actualizado")
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el perfil")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-col items-center gap-3 pt-1">
        <button
          type="button"
          className="relative overflow-hidden rounded-full focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          onClick={onPickPhoto}
          disabled={uploading}
          aria-label="Cambiar foto de perfil"
        >
          <Avatar className="size-20 after:rounded-full">
            {preview || user.avatarThumbUrl || user.avatarUrl ? (
              <AvatarImage src={preview ?? user.avatarThumbUrl ?? user.avatarUrl ?? ""} alt={user.name} />
            ) : null}
            <AvatarFallback className="text-xl">{initials(user.name)}</AvatarFallback>
          </Avatar>
          {uploading ? (
            <BusyOverlay className="rounded-full" label="Subiendo" />
          ) : (
            <span className="absolute right-0 bottom-0 flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
              <Camera className="size-3.5" />
            </span>
          )}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,image/avif"
          className="hidden"
          onChange={onPhotoChange}
        />
        <p className="text-sm text-muted-foreground">
          {uploading ? (
            <>
              Subiendo foto
              <BusyDots />
            </>
          ) : (
            "Toca la foto para cambiarla"
          )}
        </p>
      </div>

      <form className="grid gap-4" onSubmit={onSubmit}>
        <div className="grid gap-2">
          <FieldLabel htmlFor="profile-name" icon={UserRound}>
            Nombre
          </FieldLabel>
          <Input
            id="profile-name"
            className="h-11"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={120}
            required
          />
        </div>
        <div className="grid gap-2">
          <FieldLabel htmlFor="profile-email" icon={Mail}>
            Correo
          </FieldLabel>
          <Input
            id="profile-email"
            className="h-11"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </div>
        <div className="grid gap-2">
          <FieldLabel htmlFor="profile-new-password" icon={KeyRound}>
            Nueva contraseña
          </FieldLabel>
          <Input
            id="profile-new-password"
            className="h-11"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <FieldLabel htmlFor="profile-confirm-password" icon={KeyRound}>
            Confirmar contraseña
          </FieldLabel>
          <Input
            id="profile-confirm-password"
            className="h-11"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {notice ? <p className="text-sm text-emerald-600 dark:text-emerald-400">{notice}</p> : null}
        <Button type="submit" className="h-11" disabled={saving}>
          <Save data-icon="inline-start" />
          {saving ? "Guardando…" : "Guardar cambios"}
        </Button>
      </form>
    </div>
  )
}

const CreateAccountForm = () => {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setNotice(null)

    const nextName = name.trim()
    const nextEmail = email.trim().toLowerCase()
    if (!nextName) {
      setError("El nombre es obligatorio")
      return
    }
    if (!nextEmail) {
      setError("El correo es obligatorio")
      return
    }
    if (!password) {
      setError("La contraseña es obligatoria")
      return
    }

    setSaving(true)
    try {
      const data = await createAccount({ name: nextName, email: nextEmail, password })
      setName("")
      setEmail("")
      setPassword("")
      setNotice(`Cuenta creada para ${data.user.name}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear la cuenta")
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="grid gap-4" onSubmit={onSubmit}>
      <div className="grid gap-2">
        <FieldLabel htmlFor="account-name" icon={UserRound}>
          Nombre
        </FieldLabel>
        <Input
          id="account-name"
          className="h-11"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={120}
          autoComplete="off"
          required
        />
      </div>
      <div className="grid gap-2">
        <FieldLabel htmlFor="account-email" icon={Mail}>
          Correo
        </FieldLabel>
        <Input
          id="account-email"
          className="h-11"
          type="email"
          autoComplete="off"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </div>
      <div className="grid gap-2">
        <FieldLabel htmlFor="account-password" icon={KeyRound}>
          Contraseña
        </FieldLabel>
        <Input
          id="account-password"
          className="h-11"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {notice ? <p className="text-sm text-emerald-600 dark:text-emerald-400">{notice}</p> : null}
      <Button type="submit" className="h-11" disabled={saving}>
        <UserPlus data-icon="inline-start" />
        {saving ? "Creando…" : "Crear cuenta"}
      </Button>
    </form>
  )
}
