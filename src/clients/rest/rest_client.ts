import querystring from 'querystring';

import {Context} from '../../context';
import {ShopifyHeader} from '../../base_types';
import {HttpClient} from '../http_client/http_client';
import {ApiClientParams, ApiClientType, RequestParams, GetRequestParams} from '../http_client/types';
import * as ShopifyErrors from '../../error';

import {RestRequestReturn, PageInfo} from './types';

interface AccessTokenHeader {
  header: string;
  value: string;
}

class RestClient extends HttpClient {
  private static LINK_HEADER_REGEXP = /<([^<]+)>; rel="([^"]+)"/;

  readonly apiType: ApiClientType;
  readonly accessToken?: string;

  public constructor(params: ApiClientParams) {
    super(params.domain);

    this.apiType = params.apiType || ApiClientType.Admin;
    this.accessToken = params.accessToken;

    if (!Context.IS_PRIVATE_APP && !this.accessToken) {
      throw new ShopifyErrors.MissingRequiredArgument('Missing access token when creating REST client');
    }
  }

  protected async request(params: RequestParams): Promise<RestRequestReturn> {
    const accessTokenHeader: AccessTokenHeader = this.getAccessTokenHeaderForApiType();
    params.extraHeaders = {
      [accessTokenHeader.header]: accessTokenHeader.value,
      ...params.extraHeaders,
    };

    params.path = this.getRestPath(params.path);

    const ret = (await super.request(params)) as RestRequestReturn;

    const link = ret.headers.get('link');
    if (params.query && link !== undefined) {
      const pageInfo: PageInfo = {
        limit: params.query.limit.toString(),
      };

      if (link) {
        const links = link.split(', ');

        for (const link of links) {
          const parsedLink = link.match(RestClient.LINK_HEADER_REGEXP);
          if (!parsedLink) {
            continue;
          }

          const linkRel = parsedLink[2];
          const linkUrl = new URL(parsedLink[1]);
          const linkFields = linkUrl.searchParams.get('fields');
          const linkPageToken = linkUrl.searchParams.get('page_info');

          if (!pageInfo.fields && linkFields) {
            pageInfo.fields = linkFields.split(',');
          }

          if (linkPageToken) {
            switch (linkRel) {
              case 'previous':
                pageInfo.previousPageUrl = parsedLink[1];
                pageInfo.prevPage = this.buildRequestParams(parsedLink[1]);
                break;
              case 'next':
                pageInfo.nextPageUrl = parsedLink[1];
                pageInfo.nextPage = this.buildRequestParams(parsedLink[1]);
                break;
            }
          }
        }
      }

      ret.pageInfo = pageInfo;
    }

    return ret;
  }

  private getRestPath(path: string): string {
    return `${this.getBasePathForApiType()}/${Context.API_VERSION}/${path}.json`;
  }

  private buildRequestParams(newPageUrl: string): GetRequestParams {
    const pattern = `^${this.getBasePathForApiType()}/[^/]+/(.*).json$`;

    const url = new URL(newPageUrl);
    const path = url.pathname.replace(new RegExp(pattern), '$1');
    const query = querystring.decode(url.search.replace(/^\?(.*)/, '$1')) as Record<string, string | number>;
    return {
      path,
      query,
    };
  }

  private getBasePathForApiType(): string {
    switch (this.apiType) {
      case ApiClientType.Admin:
        return '/admin/api';
      default:
        throw new ShopifyErrors.ShopifyError(`Unsupported REST API client type '${this.apiType}'`);
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
      default:
        throw new ShopifyErrors.ShopifyError(`Unsupported REST API client type '${this.apiType}'`);
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

export {RestClient};
