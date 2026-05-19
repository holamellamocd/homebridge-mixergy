const BASE_URL = 'https://www.mixergy.io/api/v2';

interface ApiLogger {
  debug(message: string, ...parameters: unknown[]): void;
  error(message: string, ...parameters: unknown[]): void;
}

export interface TankMeasurement {
  topTemperature: number;
  bottomTemperature: number;
  charge: number;
  target_charge?: number;
  state: string;
}

export interface ParsedState {
  electricHeatSource: boolean;
  indirectHeatSource: boolean;
  heatPumpHeatSource: boolean;
}

export interface MixergyTank {
  id: string;
  serialNumber: string;
  displayName: string;
}

export type HeatSource = 'electric' | 'indirect' | 'heat_pump';

interface ApiTank {
  id: string;
  serialNumber: string;
  description?: string;
}

interface TankListResponse {
  _embedded?: {
    tankList?: ApiTank[];
  };
}

interface LoginResponse {
  token: string;
}

export function parseState(raw: string): ParsedState {
  try {
    const s = JSON.parse(raw);
    return {
      electricHeatSource: s.electric_heat_source === true,
      indirectHeatSource: s.indirect_heat_source === true,
      heatPumpHeatSource: s.heat_pump_heat_source === true,
    };
  } catch {
    return { electricHeatSource: false, indirectHeatSource: false, heatPumpHeatSource: false };
  }
}

export class MixergyApi {
  private token: string | null = null;

  constructor(
    private readonly username: string,
    private readonly password: string,
    private readonly log: ApiLogger,
  ) {}

  async authenticate(): Promise<void> {
    const res = await fetch(`${BASE_URL}/account/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: this.username, password: this.password }),
    });
    if (!res.ok) {
      throw new Error(`Mixergy login failed: ${res.status} ${res.statusText}`);
    }
    const data = await res.json() as LoginResponse;
    this.token = data.token;
    this.log.debug('Mixergy authenticated successfully');
  }

  private authHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.token}`,
      'Content-Type': 'application/json',
    };
  }

  private async request<T>(url: string, options: RequestInit = {}): Promise<T> {
    const res = await fetch(url, { ...options, headers: this.authHeaders() });
    if (res.status === 401) {
      this.log.debug('Token expired, re-authenticating');
      await this.authenticate();
      const retry = await fetch(url, { ...options, headers: this.authHeaders() });
      if (!retry.ok) throw new Error(`Request failed after re-auth: ${retry.status}`);
      return retry.json() as Promise<T>;
    }
    if (!res.ok) throw new Error(`Request failed: ${res.status} ${res.statusText}`);
    return res.json() as Promise<T>;
  }

  async getTanks(): Promise<MixergyTank[]> {
    const data = await this.request<TankListResponse>(`${BASE_URL}/tanks`);
    return (data._embedded?.tankList ?? []).map(t => ({
      id: t.id,
      serialNumber: t.serialNumber,
      displayName: `Mixergy ${t.serialNumber}`,
    }));
  }

  async getLatestMeasurement(tankId: string): Promise<TankMeasurement> {
    return this.request<TankMeasurement>(
      `${BASE_URL}/tanks/${tankId}/measurements/latest`,
    );
  }

  async setCharge(tankId: string, charge: number): Promise<void> {
    await this.request(`${BASE_URL}/tanks/${tankId}/control`, {
      method: 'PUT',
      body: JSON.stringify({ charge }),
    });
    this.log.debug(`Set charge for ${tankId} to ${charge}%`);
  }

  async getSchedule(tankId: string): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(`${BASE_URL}/tanks/${tankId}/schedule`);
  }

  async setDefaultHeatSource(tankId: string, heatSource: HeatSource): Promise<void> {
    const schedule = await this.getSchedule(tankId);
    schedule['defaultHeatSource'] = heatSource;
    await this.request(`${BASE_URL}/tanks/${tankId}/schedule`, {
      method: 'PUT',
      body: JSON.stringify(schedule),
    });
    this.log.debug(`Set default heat source for ${tankId} to ${heatSource}`);
  }
}
