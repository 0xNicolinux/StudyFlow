import Dexie, { type EntityTable } from "dexie";
import type { Conversation, DocText, Flashcard, GenerationJob, Message, Note, Profile, ProfilePost, Quiz, QuizAttempt, StudyDocument, StudySession, Subject, Task } from "./schemas";

export class StudyFlowDB extends Dexie {
  subjects!: EntityTable<Subject, "id">;
  tasks!: EntityTable<Task, "id">;
  notes!: EntityTable<Note, "id">;
  profile!: EntityTable<Profile, "id">;
  posts!: EntityTable<ProfilePost, "id">;
  conversations!: EntityTable<Conversation, "id">;
  messages!: EntityTable<Message, "id">;
  studySessions!: EntityTable<StudySession, "id">;
  flashcards!: EntityTable<Flashcard, "id">;
  quizzes!: EntityTable<Quiz, "id">;
  quizAttempts!: EntityTable<QuizAttempt, "id">;
  documents!: EntityTable<StudyDocument, "id">;
  docTexts!: EntityTable<DocText, "id">;
  docFiles!: EntityTable<{ id: string; blob: Blob }, "id">;
  generationJobs!: EntityTable<GenerationJob, "id">;

  constructor(name = "studyflow") {
    super(name);
    // Novas versões do esquema devem ser adicionadas com db.version(n+1), nunca editando a anterior.
    this.version(1).stores({
      subjects: "id, name, updatedAt",
      tasks: "id, subjectId, dueAt, done",
      notes: "id, subjectId, updatedAt",
      profile: "id",
    });
    // v2: conversas de IA (somente adiciona tabelas; dados da v1 permanecem intactos).
    this.version(2).stores({
      conversations: "id, updatedAt",
      messages: "id, conversationId, createdAt",
    });
    // v3: ferramentas de estudo e biblioteca. Textos e arquivos ficam em tabelas separadas para listar sem carregá-los.
    this.version(3).stores({
      studySessions: "id, subjectId, startedAt",
      flashcards: "id, subjectId, dueAt",
      quizzes: "id, subjectId",
      quizAttempts: "id, quizId, subjectId, at",
      documents: "id, subjectId, createdAt",
      docTexts: "id",
      docFiles: "id",
    });
    // v4: publicações do feed de perfil, armazenadas localmente como os demais dados.
    this.version(4).stores({
      posts: "id, createdAt",
    });
    // v5: fila e histórico local das gerações da IA.
    this.version(5).stores({
      generationJobs: "id, status, kind, subjectId, createdAt, completedAt, viewedAt, &sourceKey",
    });
  }
}

export let db = new StudyFlowDB();

/** Usado apenas pelos testes para isolar o banco. */
export function __setDb(next: StudyFlowDB) {
  db = next;
}
