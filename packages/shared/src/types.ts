// ── Enums ──

export type UserRole = "admin" | "member";
export type CohortRole = "student" | "instructor";
export type TagType = "preset" | "custom";
export type ReviewVerdict = "approved" | "needs_revision";

// ── Entities ──

export type User = {
  id: string;
  email: string;
  display_name: string;
  role: UserRole;
  created_at: string;
  updated_at: string;
};

export type Cohort = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  created_at: string;
  updated_at: string;
};

export type UserCohort = {
  user_id: string;
  cohort_id: string;
  role_in_cohort: CohortRole;
  created_at: string;
};

// ── Auth API ──

export type SignupRequest = {
  display_name: string;
};

export type LoginResponse = {
  id: string;
  email: string;
  display_name: string;
  role: UserRole;
  cohorts: {
    cohort_id: string;
    name: string;
    role_in_cohort: CohortRole;
    start_date: string;
    end_date: string;
  }[];
  created_at: string;
};

// ── Cohort API ──

export type CreateCohortRequest = {
  name: string;
  start_date: string;
  end_date: string;
};

export type UpdateCohortRequest = {
  name?: string;
  start_date?: string;
  end_date?: string;
};

export type CohortWithCount = Cohort & {
  member_count: number;
};

export type AddMemberRequest = {
  user_id: string;
  role_in_cohort: CohortRole;
};

export type CohortMember = {
  user_id: string;
  email: string;
  display_name: string;
  role_in_cohort: CohortRole;
  created_at: string;
};

// ── Thread Entities ──

export type Thread = {
  id: string;
  user_id: string;
  cohort_id: string;
  title: string;
  pinned_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Message = {
  id: string;
  thread_id: string;
  body: string;
  position: number;
  created_at: string;
  updated_at: string;
};

export type Todo = {
  id: string;
  thread_id: string;
  message_id: string | null;
  content: string;
  position: number;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Link = {
  id: string;
  thread_id: string;
  message_id: string | null;
  url: string;
  title: string | null;
  description: string | null;
  domain: string;
  position: number;
  created_at: string;
  updated_at: string;
};

export type Tag = {
  id: string;
  name: string;
  type: TagType;
  cohort_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type ThreadTag = {
  thread_id: string;
  tag_id: string;
  created_at: string;
};

// ── Thread API ──

export type CreateThreadRequest = {
  title: string;
  tag_ids?: string[];
};

export type UpdateThreadRequest = {
  title?: string;
  pinned?: boolean;
};

export type TagSummary = {
  id: string;
  name: string;
  type: TagType;
};

export type ThreadListItem = {
  id: string;
  title: string;
  pinned_at: string | null;
  tags: TagSummary[];
  incomplete_todo_count: number;
  created_at: string;
  updated_at: string;
};

export type ThreadListResponse = {
  threads: ThreadListItem[];
  next_cursor: string | null;
};

export type ThreadDetailResponse = {
  id: string;
  title: string;
  cohort_id: string;
  pinned_at: string | null;
  tags: TagSummary[];
  messages: Omit<Message, "thread_id">[];
  todos: {
    id: string;
    content: string;
    message_id: string | null;
    position: number;
    completed_at: string | null;
    created_at: string;
  }[];
  links: {
    id: string;
    url: string;
    title: string | null;
    description: string | null;
    domain: string;
    message_id: string | null;
    position: number;
    created_at: string;
  }[];
  created_at: string;
  updated_at: string;
};

export type ThreadSummaryResponse = {
  id: string;
  title: string;
  cohort_id: string;
  pinned_at: string | null;
  tags: TagSummary[];
  incomplete_todo_count: number;
  created_at: string;
  updated_at: string;
};

// ── Message API ──

export type CreateMessageRequest = {
  body: string;
};

export type UpdateMessageRequest = {
  body: string;
};

export type MessageResponse = {
  id: string;
  body: string;
  position: number;
  created_at: string;
  updated_at: string;
};

export type MessageListResponse = {
  messages: MessageResponse[];
  next_cursor: string | null;
};

export type ReorderMessagesRequest = {
  message_ids: string[];
};

export type ReorderMessagesResponse = {
  messages: { id: string; position: number }[];
};

// ── Todo API ──

export type CreateTodoRequest = {
  content: string;
  message_id?: string;
};

export type UpdateTodoRequest = {
  content?: string;
  completed?: boolean;
};

export type TodoResponse = {
  id: string;
  content: string;
  message_id: string | null;
  position: number;
  completed_at: string | null;
  created_at: string;
};

export type TodoDetailResponse = TodoResponse & {
  updated_at: string;
};

export type TodoListResponse = {
  todos: TodoResponse[];
};

export type CrossThreadTodoItem = {
  id: string;
  content: string;
  completed_at: null;
  created_at: string;
  thread: {
    id: string;
    title: string;
  };
};

export type CrossThreadTodoResponse = {
  todos: CrossThreadTodoItem[];
  next_cursor: string | null;
};

// ── Link API ──

export type CreateLinkRequest = {
  url: string;
  message_id?: string;
};

export type UpdateLinkRequest = {
  title?: string;
  description?: string;
};

export type LinkResponse = {
  id: string;
  url: string;
  title: string | null;
  description: string | null;
  domain: string;
  message_id: string | null;
  position: number;
  created_at: string;
};

export type LinkListResponse = {
  links: LinkResponse[];
};

// ── Tag API ──

export type CreateTagRequest = {
  name: string;
};

export type CreatePresetTagRequest = {
  name: string;
  cohort_id?: string;
};

export type UpdateTagRequest = {
  name: string;
};

export type TagResponse = {
  id: string;
  name: string;
  type: TagType;
  cohort_id: string | null;
  created_at: string;
};

export type TagListResponse = {
  tags: TagResponse[];
};

export type AddThreadTagRequest = {
  tag_id: string;
};

export type ThreadTagResponse = {
  thread_id: string;
  tag_id: string;
  created_at: string;
};

// ── API Error ──

export type ApiError = {
  error: {
    code: string;
    message: string;
  };
};
