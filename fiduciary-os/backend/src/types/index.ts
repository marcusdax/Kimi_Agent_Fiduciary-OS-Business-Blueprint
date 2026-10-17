// User Types
export interface User {
  id: string;
  email: string;
  name: string;
  role: 'client' | 'advisor' | 'admin';
  advisorCode?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserInput {
  email: string;
  password: string;
  name: string;
  role?: 'client' | 'advisor' | 'admin';
}

export interface UpdateUserInput {
  name?: string;
  email?: string;
}

// Profile Types
export interface Profile {
  id: string;
  userId: string;
  age: number;
  retirementAge: number;
  filingStatus: 'single' | 'married' | 'head';
  stateTaxRate: number;
  employmentStatus: 'employed' | 'self' | 'retired' | 'semi';
  annualIncome: number;
  investableAssets: number;
  monthlyExpenses: number;
  retirementSavings: number;
  primaryGoal: 'retire' | 'grow' | 'protect' | 'income' | 'legacy';
  riskTolerance: number;
  investmentStyle: 'passive' | 'active' | 'dividend' | 'growth';
  cryptoAllocation: number;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Portfolio Types
export interface Portfolio {
  id: string;
  userId: string;
  totalValue: number;
  holdings: Holding[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Holding {
  id: string;
  portfolioId: string;
  symbol: string;
  quantity: number;
  avgCost: number;
  createdAt: Date;
  updatedAt: Date;
}

// Document Types
export interface Document {
  id: string;
  userId: string;
  name: string;
  type: string;
  size: number;
  path: string;
  encrypted: boolean;
  uploadedAt: Date;
}

// API Response Types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// Auth Types
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface JwtPayload {
  userId: string;
  email: string;
  role: string;
  iat: number;
  exp: number;
}
