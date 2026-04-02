export interface SessionInfo {
  id: string;
  deviceName: string | null;
  deviceIp: string | null;
  lastActiveAt: string;
  createdAt: string;
  expiresAt: string;
}

export interface LoginStep {
  step: "credentials" | "2fa" | "2fa-setup";
  challengeToken?: string;
  requiresMfaSetup?: boolean;
}

export type LoginFormValues = {
  email: string;
  password: string;
};

export type TwoFactorFormValues = {
  code: string;
};
