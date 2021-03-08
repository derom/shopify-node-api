import '../../../test/test_helper';
import {ShopifyHeader} from '../../../base_types';
import {assertHttpRequest} from '../../http_client/test/test_helper';
import {GraphqlClient} from '../graphql_client';
import {Context} from '../../../context';
import * as ShopifyErrors from '../../../error';
import {ApiClientType} from '../../http_client/types';

const DOMAIN = 'shop.myshopify.com';
const QUERY = `
{
  shop {
    name
  }
}
`;

const successResponse = {
  data: {
    shop: {
      name: 'Shoppity Shop',
    },
  },
};

describe('GraphQL client', () => {
  it('can return response from Admin API by default', async () => {
    const client: GraphqlClient = new GraphqlClient({
      domain: DOMAIN,
      accessToken: 'bork',
    });
    expect(client.apiType).toEqual(ApiClientType.Admin);

    fetchMock.mockResponseOnce(JSON.stringify(successResponse));

    await expect(client.query({data: QUERY})).resolves.toEqual(buildExpectedResponse(successResponse));
    assertHttpRequest({
      method: 'POST',
      domain: DOMAIN,
      path: '/admin/api/unstable/graphql.json',
      data: QUERY,
    });
  });

  it('can return response from Storefront API', async () => {
    const client: GraphqlClient = new GraphqlClient({
      apiType: ApiClientType.Storefront,
      domain: DOMAIN,
      accessToken: 'bork',
    });
    expect(client.apiType).toEqual(ApiClientType.Storefront);

    fetchMock.mockResponseOnce(JSON.stringify(successResponse));

    await expect(client.query({data: QUERY})).resolves.toEqual(buildExpectedResponse(successResponse));
    assertHttpRequest({
      method: 'POST',
      domain: DOMAIN,
      path: '/api/unstable/graphql.json',
      data: QUERY,
    });
  });

  it('fails with invalid API type', async () => {
    const client = new GraphqlClient({
      apiType: 'Invalid type!' as ApiClientType,
      domain: DOMAIN,
      accessToken: 'dummy-token',
    });

    await expect(client.query({data: QUERY})).rejects.toThrow(ShopifyErrors.ShopifyError);
  });

  it('merges custom headers with default', async () => {
    const client: GraphqlClient = new GraphqlClient({
      domain: DOMAIN,
      accessToken: 'bork',
    });
    const customHeader: Record<string, string> = {
      'X-Glib-Glob': 'goobers',
    };

    fetchMock.mockResponseOnce(JSON.stringify(successResponse));

    await expect(client.query({extraHeaders: customHeader, data: QUERY})).resolves.toEqual(
      buildExpectedResponse(successResponse),
    );

    customHeader[ShopifyHeader.AccessToken] = 'bork';
    assertHttpRequest({
      method: 'POST',
      domain: DOMAIN,
      path: '/admin/api/unstable/graphql.json',
      headers: customHeader,
      data: QUERY,
    });
  });

  it('adapts to private app requests', async () => {
    Context.IS_PRIVATE_APP = true;
    Context.initialize(Context);

    const client: GraphqlClient = new GraphqlClient({domain: DOMAIN});
    fetchMock.mockResponseOnce(JSON.stringify(successResponse));

    await expect(client.query({data: QUERY})).resolves.toEqual(buildExpectedResponse(successResponse));

    const customHeaders: Record<string, string> = {};
    customHeaders[ShopifyHeader.AccessToken] = 'test_secret_key';

    assertHttpRequest({
      method: 'POST',
      domain: DOMAIN,
      path: '/admin/api/unstable/graphql.json',
      data: QUERY,
      headers: customHeaders,
    });
  });

  it('fails for private apps without a token', async () => {
    Context.IS_PRIVATE_APP = true;
    Context.PRIVATE_APP_STOREFRONT_ACCESS_TOKEN = undefined;
    Context.initialize(Context);

    const client: GraphqlClient = new GraphqlClient({
      apiType: ApiClientType.Storefront,
      domain: DOMAIN,
    });

    await expect(client.query({data: QUERY})).rejects.toThrow(ShopifyErrors.ShopifyError);
  });

  it('fails to instantiate without access token', () => {
    expect(() => new GraphqlClient({domain: DOMAIN})).toThrow(ShopifyErrors.MissingRequiredArgument);
  });

  it('can handle queries with variables', async () => {
    const client: GraphqlClient = new GraphqlClient({
      domain: DOMAIN,
      accessToken: 'bork',
    });
    const queryWithVariables = {
      query: `query FirstTwo($first: Int) {
        products(first: $first) {
          edges {
            node {
              id
          }
        }
      }
    }`,
      variables: `{
        'first': 2,
      }`,
    };
    const expectedResponse = {
      data: {
        products: {
          edges: [
            {
              node: {
                id: 'foo',
              },
            },
            {
              node: {
                id: 'bar',
              },
            },
          ],
        },
      },
    };

    fetchMock.mockResponseOnce(JSON.stringify(expectedResponse));

    await expect(client.query({data: queryWithVariables})).resolves.toEqual(buildExpectedResponse(expectedResponse));

    assertHttpRequest({
      method: 'POST',
      domain: DOMAIN,
      path: '/admin/api/unstable/graphql.json',
      headers: {'Content-Length': 219, 'Content-Type': 'application/json', 'X-Shopify-Access-Token': 'bork'},
      data: JSON.stringify(queryWithVariables),
    });
  });
});

function buildExpectedResponse(obj: unknown) {
  const expectedResponse = {
    body: obj,
    headers: expect.objectContaining({}),
  };
  return expect.objectContaining(expectedResponse);
}
