import {MissingRequiredArgument} from '../../error';
import {Context} from '../../context';
import {ShopifyHeader} from '../../base_types';
import {HttpClient} from '../http_client/http_client';
import {ApiClientParams, ApiClientType, DataType, RequestReturn} from '../http_client/types';
import * as ShopifyErrors from '../../error';

import {GraphqlParams} from './types';

interface AccessTokenHeader {
  header: string;
  value: string;
}

export class GraphqlClient {
  readonly apiType: ApiClientType;
  readonly domain: string;
  readonly accessToken?: string;

  private readonly client: HttpClient;

  // When we next release a major version for this library, we should remove string as a valid type for params and
  // remove the accessToken param. Also remove the first block.
  public constructor(params: ApiClientParams | string, accessToken?: string) {
    if (typeof params === 'string') {
      // eslint-disable-next-line no-param-reassign
      params = {
        domain: params,
        accessToken,
      };
    }

    this.domain = params.domain;
    this.client = new HttpClient(this.domain);

    this.apiType = params.apiType || ApiClientType.Admin;
    this.accessToken = params.accessToken;

    if (!Context.IS_PRIVATE_APP && !this.accessToken) {
      throw new ShopifyErrors.MissingRequiredArgument('Missing access token when creating GraphQL client');
    }
  }

  async query(params: GraphqlParams): Promise<RequestReturn> {
    if (params.data.length === 0) {
      throw new MissingRequiredArgument('Query missing.');
    }

    const accessTokenHeader: AccessTokenHeader = this.getAccessTokenHeaderForApiType();
    params.extraHeaders = {
      [accessTokenHeader.header]: accessTokenHeader.value,
      ...params.extraHeaders,
    };
    const path = `${this.getBasePathForApiType()}/${Context.API_VERSION}/graphql.json`;

    let dataType: DataType.GraphQL | DataType.JSON;

    if (typeof params.data === 'object') {
      dataType = DataType.JSON;
    } else {
      dataType = DataType.GraphQL;
    }

    return this.client.post({path, type: dataType, ...params});
  }

  private getBasePathForApiType(): string {
    switch (this.apiType) {
      case ApiClientType.Admin:
        return '/admin/api';
      case ApiClientType.Storefront:
        return '/api';
      default:
        throw new ShopifyErrors.ShopifyError(`Unsupported GraphQL API client type '${this.apiType}'`);
    }
  }

  private getAccessTokenHeaderForApiType(): AccessTokenHeader {
    let header: string;
    let value: string | undefined;
    switch (this.apiType) {
      case ApiClientType.Admin:
        header = ShopifyHeader.AccessToken;
        value = Context.IS_PRIVATE_APP ? Context.API_SECRET_KEY : this.accessToken;
        break;
      case ApiClientType.Storefront:
        header = ShopifyHeader.StorefrontAccessToken;
        value = Context.IS_PRIVATE_APP ? Context.PRIVATE_APP_STOREFRONT_ACCESS_TOKEN : this.accessToken;
        break;
      default:
        throw new ShopifyErrors.ShopifyError(`Unsupported GraphQL API client type '${this.apiType}'`);
    }

    if (!value) {
      throw new ShopifyErrors.ShopifyError(
        `Could not determine the access token header for API client type '${this.apiType}'`,
      );
    }

    return {
      header,
      value,
    };
  }
}
