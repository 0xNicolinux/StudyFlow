"use client";

import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ImagePlus, MapPin, Paperclip, Pencil, SendHorizontal, Trash2, Video, X } from "lucide-react";
import { db } from "@/lib/db";
import { createProfilePost, deleteProfilePost, saveProfile } from "@/lib/repo";
import type { Profile, ProfilePost } from "@/lib/schemas";
import { initials } from "@/lib/format";
import { Button } from "./ui";

const MAX_AVATAR = 400 * 1024;
const MAX_COVER = 3 * 1024 * 1024;
const MAX_POST_MEDIA = 2.8 * 1024 * 1024;

const EDUCATION_LABELS: Record<string, string> = {
  fundamental: "Ensino fundamental",
  medio: "Ensino médio",
  tecnico: "Ensino técnico",
  superior: "Ensino superior",
  pos: "Pós-graduação",
  outro: "Outro",
};

const COUNTRIES: Record<string, string> = {
  Brasil: "🇧🇷",
  Portugal: "🇵🇹",
  Argentina: "🇦🇷",
  "Estados Unidos": "🇺🇸",
  Outro: "🌐",
};

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Arquivo inválido"));
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo"));
    reader.readAsDataURL(file);
  });
}

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(timestamp);
}

export function ProfilePanel() {
  const profile = useLiveQuery(() => db.profile.get("me").then((p) => p ?? null), []);
  const posts = useLiveQuery(() => db.posts.orderBy("createdAt").reverse().toArray(), []);
  const [editing, setEditing] = useState(false);
  const [postText, setPostText] = useState("");
  const [postMedia, setPostMedia] = useState<string | null>(null);
  const [postMediaType, setPostMediaType] = useState<"image" | "video" | null>(null);
  const [postMediaName, setPostMediaName] = useState<string | null>(null);
  const [postError, setPostError] = useState("");
  const [posting, setPosting] = useState(false);
  const postFileRef = useRef<HTMLInputElement>(null);
  const subjectCount = useLiveQuery(() => db.subjects.count(), []);

  const person = profile;
  const name = person?.name || "Estudante";
  const country = person?.country || "Brasil";
  const education = person?.educationLevel ? EDUCATION_LABELS[person.educationLevel] : "";
  const roleLabel = person?.role === "professor" ? "Professor(a)" : "Estudante";

  async function attachPostMedia(file?: File) {
    if (!file) return;
    if (!(file.type.startsWith("image/") || ["video/mp4", "video/webm"].includes(file.type))) {
      setPostError("Anexe uma imagem, GIF ou vídeo MP4/WebM.");
      return;
    }
    if (file.size > MAX_POST_MEDIA) {
      setPostError("A mídia precisa ter até 2,8 MB nesta versão local.");
      return;
    }
    try {
      setPostMedia(await readDataUrl(file));
      setPostMediaType(file.type.startsWith("video/") ? "video" : "image");
      setPostMediaName(file.name);
      setPostError("");
    } catch {
      setPostError("Não foi possível abrir esse arquivo.");
    }
    if (postFileRef.current) postFileRef.current.value = "";
  }

  async function submitPost(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!postText.trim() && !postMedia) {
      setPostError("Escreva algo ou anexe uma mídia.");
      return;
    }
    setPosting(true);
    setPostError("");
    try {
      await createProfilePost({ text: postText, media: postMedia, mediaType: postMediaType, mediaName: postMediaName });
      setPostText("");
      setPostMedia(null);
      setPostMediaType(null);
      setPostMediaName(null);
    } catch {
      setPostError("Não foi possível publicar. Confira o conteúdo e tente novamente.");
    } finally {
      setPosting(false);
    }
  }

  async function removePost(post: ProfilePost) {
    if (!window.confirm("Excluir esta publicação?")) return;
    await deleteProfilePost(post.id);
  }

  return (
    <div className="profile-page fade-in mx-auto w-full max-w-4xl space-y-5">
      <section className="profile-hero overflow-hidden rounded-xl border border-line bg-surface">
        <div className="profile-cover">
          {person?.cover?.startsWith("data:video/") ? (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video className="profile-cover-media" src={person.cover} autoPlay muted loop playsInline aria-label="Vídeo de capa do perfil" />
          ) : person?.cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="profile-cover-media" src={person.cover} alt="Capa do perfil" />
          ) : (
            <div className="profile-cover-empty"><span>PERFIL</span><span>STUDYFLOW</span></div>
          )}
          <span className="profile-country">{COUNTRIES[country] ?? "🌐"} {country}</span>
        </div>

        <div className="profile-identity">
          <div className="profile-avatar">
            {person?.photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={person.photo} alt={`Foto de ${name}`} />
            ) : <span>{initials(name)}</span>}
          </div>
          <div className="profile-identity-main">
            <div className="profile-name-row">
              <div className="min-w-0">
                <h2 className="profile-name">{name}</h2>
                <p className="profile-role">{roleLabel}{person?.institution ? ` · ${person.institution}` : ""}</p>
              </div>
              <Button variant="subtle" onClick={() => setEditing((v) => !v)}><Pencil className="size-3.5" aria-hidden /> {editing ? "Fechar edição" : "Editar perfil"}</Button>
            </div>
            <div className="profile-metadata">
              {education && <span>{education}</span>}
              {person?.graduationYear && <span>Conclusão em {person.graduationYear}</span>}
              <span>{subjectCount ?? 0} {(subjectCount ?? 0) === 1 ? "disciplina" : "disciplinas"}</span>
            </div>
          </div>
        </div>

        {editing && (
          <ProfileEditor key={person?.name ?? "new"} profile={person} onSaved={() => setEditing(false)} />
        )}
      </section>

      <section className="profile-feed space-y-3" aria-labelledby="profile-feed-title">
        <div className="profile-feed-heading">
          <div>
            <h2 id="profile-feed-title" className="text-base font-semibold">Mural</h2>
            <p className="mt-1 text-xs text-muted">Suas publicações ficam salvas neste dispositivo.</p>
          </div>
          <span className="profile-post-count">{posts?.length ?? 0} {(posts?.length ?? 0) === 1 ? "publicação" : "publicações"}</span>
        </div>

        <form className="profile-composer" onSubmit={submitPost}>
          <div className="profile-composer-avatar" aria-hidden>{initials(name)}</div>
          <div className="min-w-0 flex-1 space-y-3">
            <textarea
              value={postText}
              onChange={(e) => setPostText(e.target.value)}
              maxLength={2000}
              rows={3}
              placeholder="O que você está estudando hoje?"
              aria-label="Texto da publicação"
              className="profile-post-input"
            />
            {postMedia && (
              <div className="profile-media-preview">
                {postMediaType === "video" ? (
                  // eslint-disable-next-line jsx-a11y/media-has-caption
                  <video src={postMedia} controls playsInline />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={postMedia} alt="Prévia da mídia" />
                )}
                <button type="button" onClick={() => { setPostMedia(null); setPostMediaType(null); setPostMediaName(null); }} aria-label="Remover mídia" className="profile-remove-media"><X size={15} /></button>
                {postMediaName && <span>{postMediaName}</span>}
              </div>
            )}
            {postError && <p role="alert" className="text-xs text-danger">{postError}</p>}
            <div className="profile-composer-actions">
              <input ref={postFileRef} className="hidden" type="file" accept="image/*,video/mp4,video/webm" onChange={(e: ChangeEvent<HTMLInputElement>) => void attachPostMedia(e.target.files?.[0])} />
              <button type="button" className="profile-attach" onClick={() => postFileRef.current?.click()}><Paperclip size={15} aria-hidden /> Foto, GIF ou vídeo</button>
              <span className="text-xs text-muted">{postText.length}/2000</span>
              <button type="submit" disabled={posting || (!postText.trim() && !postMedia)} className="profile-submit"><SendHorizontal size={15} aria-hidden /> {posting ? "Publicando…" : "Publicar"}</button>
            </div>
          </div>
        </form>

        {posts === undefined ? (
          <div className="h-20 animate-pulse rounded-lg border border-line bg-surface" />
        ) : posts.length === 0 ? (
          <div className="profile-empty">
            <div className="profile-empty-mark">+</div>
            <h3>Nenhuma publicação ainda</h3>
            <p>Compartilhe uma descoberta, uma dúvida ou o que está estudando.</p>
          </div>
        ) : posts.map((post) => (
          <article key={post.id} className="profile-post">
            <div className="profile-post-top">
              <div className="profile-composer-avatar">{initials(name)}</div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{name}</p>
                <p className="text-xs text-muted">{formatDate(post.createdAt)} · {roleLabel}</p>
              </div>
              <button type="button" className="profile-delete" aria-label="Excluir publicação" onClick={() => void removePost(post)}><Trash2 size={15} /></button>
            </div>
            {post.text && <p className="profile-post-text">{post.text}</p>}
            {post.media && post.mediaType === "video" && (
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <video className="profile-post-media" src={post.media} controls playsInline />
            )}
            {post.media && post.mediaType === "image" && (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="profile-post-media" src={post.media} alt={post.mediaName || "Mídia da publicação"} loading="lazy" />
            )}
          </article>
        ))}
      </section>

      <p className="profile-local-note">O mural ainda é pessoal e local. A publicação online e a interação com outros estudantes ficam para a próxima etapa.</p>
    </div>
  );
}

function ProfileEditor({ profile, onSaved }: { profile: Profile | null | undefined; onSaved: () => void }) {
  const [name, setName] = useState(profile?.name ?? "Estudante");
  const [photo, setPhoto] = useState<string | null>(profile?.photo ?? null);
  const [cover, setCover] = useState<string | null>(profile?.cover ?? null);
  const [institution, setInstitution] = useState(profile?.institution ?? "");
  const [educationLevel, setEducationLevel] = useState<NonNullable<Profile["educationLevel"]>>(profile?.educationLevel ?? "superior");
  const [graduationYear, setGraduationYear] = useState(profile?.graduationYear?.toString() ?? "");
  const [role, setRole] = useState<NonNullable<Profile["role"]>>(profile?.role ?? "estudante");
  const [country, setCountry] = useState(profile?.country ?? "Brasil");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const avatarInput = useRef<HTMLInputElement>(null);
  const coverInput = useRef<HTMLInputElement>(null);

  async function readImage(file: File | undefined, kind: "photo" | "cover") {
    if (!file) return;
    if (!(file.type.startsWith("image/") || (kind === "cover" && ["video/mp4", "video/webm"].includes(file.type)))) {
      setError(kind === "cover" ? "Use uma imagem, GIF ou vídeo MP4/WebM para a capa." : "A foto precisa ser uma imagem.");
      return;
    }
    const max = kind === "photo" ? MAX_AVATAR : MAX_COVER;
    if (file.size > max) {
      setError(kind === "photo" ? "A foto precisa ter até 400 KB." : "A capa precisa ter até 3 MB.");
      return;
    }
    try {
      const data = await readDataUrl(file);
      if (kind === "photo") setPhoto(data); else setCover(data);
      setError("");
    } catch {
      setError("Não foi possível abrir o arquivo.");
    }
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await saveProfile({
        name, photo, cover, institution, educationLevel,
        graduationYear: graduationYear ? Number(graduationYear) : null,
        role, country,
      });
      onSaved();
    } catch {
      setError("Confira o nome e o ano de conclusão.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="profile-editor" onSubmit={submit}>
      <div className="profile-editor-heading"><div><h3>Editar informações</h3><p>Defina como seu perfil aparece no StudyFlow.</p></div></div>
      <div className="profile-upload-row">
        <div className="profile-upload-preview">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt="" />
          ) : <span>{initials(name || "Estudante")}</span>}
        </div>
        <div className="profile-upload-actions">
          <span className="text-sm font-medium">Foto de perfil</span>
          <span className="text-xs text-muted">Imagem de até 400 KB</span>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => avatarInput.current?.click()}>Escolher foto</Button>
            {photo && <Button type="button" variant="ghost" onClick={() => setPhoto(null)}>Remover</Button>}
          </div>
          <input ref={avatarInput} className="hidden" type="file" accept="image/*" onChange={(e) => void readImage(e.target.files?.[0], "photo")} />
        </div>
      </div>
      <div className="space-y-2">
        <label className="profile-field-label">Capa do perfil <span>Imagem/GIF ou vídeo de até 3 MB</span></label>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => coverInput.current?.click()}><ImagePlus size={15} /> Escolher capa</Button>
          {cover && <Button type="button" variant="ghost" onClick={() => setCover(null)}>Remover capa</Button>}
        </div>
        <input ref={coverInput} className="hidden" type="file" accept="image/*,video/mp4,video/webm" onChange={(e) => void readImage(e.target.files?.[0], "cover")} />
      </div>
      <div className="profile-form-grid">
        <label className="profile-field"><span>Nome de exibição</span><input required value={name} onChange={(e) => setName(e.target.value)} maxLength={60} /></label>
        <label className="profile-field"><span>Instituição (opcional)</span><input value={institution} onChange={(e) => setInstitution(e.target.value)} maxLength={120} placeholder="Escola, faculdade ou universidade" /></label>
        <label className="profile-field"><span>Você é</span><select value={role} onChange={(e) => setRole(e.target.value as typeof role)}><option value="estudante">Estudante</option><option value="professor">Professor(a)</option></select></label>
        <label className="profile-field"><span>Nível de ensino</span><select value={educationLevel} onChange={(e) => setEducationLevel(e.target.value as typeof educationLevel)}>{Object.entries(EDUCATION_LABELS).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="profile-field"><span>Ano de conclusão (opcional)</span><input type="number" min={2020} max={2100} value={graduationYear} onChange={(e) => setGraduationYear(e.target.value)} placeholder="2028" /></label>
        <label className="profile-field"><span>País</span><select value={country} onChange={(e) => setCountry(e.target.value)}>{Object.keys(COUNTRIES).map((v) => <option key={v}>{v}</option>)}</select></label>
      </div>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-3">
        <Button type="button" variant="ghost" onClick={onSaved}>Cancelar</Button>
        <Button type="submit" variant="primary" disabled={saving}>{saving ? "Salvando…" : "Salvar perfil"}</Button>
      </div>
    </form>
  );
}
