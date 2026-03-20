// ── Enums ──

export type UserRole = "admin" | "member";
export type CohortRole = "student" | "instructor";
export type TagType = "preset" | "custom";
export type ReviewVerdict = "approved" | "needs_revision";

// ── Entities ──

export interface User {
  id: string;
  email: string;
  display_name: string;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export interface Cohort {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  created_at: string;
  updated_at: string;
}

export interface UserCohort {
  user_id: string;
  cohort_id: string;
  role_in_cohort: CohortRole;
  created_at: string;
}

// ── Auth API ──

export interface SignupRequest {
  display_name: string;
}

export interface LoginResponse {
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
}

// ── Cohort API ──

export interface CreateCohortRequest {
  name: string;
  start_date: string;
  end_date: string;
}

export interface UpdateCohortRequest {
  name?: string;
  start_date?: string;
  end_date?: string;
}

export interface CohortWithCount extends Cohort {
  member_count: number;
}

export interface AddMemberRequest {
  user_id: string;
  role_in_cohort: CohortRole;
}

export interface CohortMember {
  user_id: string;
  email: string;
  display_name: string;
  role_in_cohort: CohortRole;
  created_at: string;
}

// ── API Error ──

export interface ApiError {
  error: {
    code: string;
    message: string;
  };
}
