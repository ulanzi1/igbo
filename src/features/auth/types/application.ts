export interface ApplicationFormValues {
  name: string;
  email: string;
  phone?: string;
  locationCity: string;
  locationState?: string;
  locationCountry: string;
  culturalConnection: string;
  reasonForJoining: string;
  referralName?: string;
  consentGiven: boolean;
}

export interface ApplicationFieldError {
  field: string;
  message: string;
}

export type ApplicationActionResult =
  | { success: true }
  | { success: false; error: ApplicationFieldError | { message: string } };

export type ResendActionResult = { success: true } | { success: false; error: string };

export interface GeoDefaults {
  city: string;
  state: string;
  country: string;
}
