import Dexie, { type EntityTable } from "dexie";
import type { Note, Profile, Subject, Task } from "./schemas";

export class StudyFlowDB extends Dexie {
  subjects!: EntityTable<Subject, "id">;
  tasks!: EntityTable<Task, "id">;
  notes!: EntityTable<Note, "id">;
  profile!: EntityTable<Profile, "id">;

  constructor(name = "studyflow") {
    super(name);
    // Novas versões do esquema devem ser adicionadas com db.version(n+1), nunca editando a anterior.
    this.version(1).stores({
      subjects: "id, name, updatedAt",
      tasks: "id, subjectId, dueAt, done",
      notes: "id, subjectId, updatedAt",
      profile: "id",
    });
  }
}

export let db = new StudyFlowDB();

/** Usado apenas pelos testes para isolar o banco. */
export function __setDb(next: StudyFlowDB) {
  db = next;
}
