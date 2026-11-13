import type { ListOptions, ModelRefResponse } from '../types';
import { BaseResource } from './base';

/** At least one criterion should be set, or the rule matches nothing useful. */
export interface CreatePrivateTransactionRuleOptions {
  /** Payment purpose of the transactions to mark as private. */
  paymentPurpose?: string;
  /** Counterpart name of the transactions to mark as private. */
  counterpartName?: string;
}

/** A rule that marks matching bank transactions as private automatically. */
export interface PrivateTransactionRule {
  id: string;
  objectName: string;
  create: string;
  update: string;
  sevClient: ModelRefResponse;
  paymentPurpose: string | null;
  counterpartName: string | null;
}

export class PrivateTransactionRulesResource extends BaseResource {
  /** Retrieves the rules via `GET /PrivateTransactionRule`. */
  public list(options: ListOptions = {}): Promise<PrivateTransactionRule[]> {
    return this.http.request<PrivateTransactionRule[]>({
      method: 'GET',
      path: '/PrivateTransactionRule',
      query: { limit: options.limit, offset: options.offset },
    });
  }

  /** Creates a rule via `POST /PrivateTransactionRule`. */
  public create(
    options: CreatePrivateTransactionRuleOptions,
  ): Promise<PrivateTransactionRule> {
    return this.http.request<PrivateTransactionRule>({
      method: 'POST',
      path: '/PrivateTransactionRule',
      body: {
        objectName: 'PrivateTransactionRule',
        paymentPurpose: options.paymentPurpose,
        counterpartName: options.counterpartName,
      },
    });
  }

  /** Deletes a rule via `DELETE /PrivateTransactionRule/{id}`. */
  public async delete(options: { ruleId: number }): Promise<void> {
    await this.http.request<void>({
      method: 'DELETE',
      path: `/PrivateTransactionRule/${options.ruleId}`,
    });
  }
}
