export interface Subtask {
  id: string;
  title: string;
  done: boolean;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  category: string;
  priority: "low" | "medium" | "high";
  status: "todo" | "in-progress" | "done";
  dueDate?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  subtasks: Subtask[];
}

export interface Category {
  id: string;
  name: string;
  color: string;
}
