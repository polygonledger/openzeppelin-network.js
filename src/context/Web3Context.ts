import Web3 from 'web3';
import { Provider } from 'web3/providers';
import { EventEmitter } from 'events';
import timeout from '../util/timeout';

import { getNetworkName } from '../util/network';
declare global {
  interface Window {
    ethereum: Provider;
  }
}

interface Web3ContextOptions {
  timeout: number;
}

interface ExtendedProvider extends Provider {
  isMetaMask: boolean;
  isTrust: boolean;
  isGoWallet: boolean;
  isAlphaWallet: boolean;
  isStatus: boolean;
  isToshi: boolean;
  host: string;
}

// TODO: Change event to use types using conditional types
export default class Web3Context extends EventEmitter {
  public connected: boolean;
  public accounts: string[] | null;
  public networkId: number | null;
  public networkName: string | null;
  public readonly lib: Web3;
  public readonly timeout: number;

  public static NetworkIdChangedEventName = 'NetworkIdChanged';
  public static AccountsChangedEventName = 'AccountsChanged';
  public static ConnectionChangedEventName = 'ConnectionChanged';

  private interval: NodeJS.Timeout;

  public constructor(provider: Provider, options: Web3ContextOptions = { timeout: 3000 }) {
    super();

    this.lib = new Web3(provider);
    this.timeout = options.timeout;
  }

  public startPoll(): void {
    // TODO: polling interval should depend on kind of web3 provider
    // We can query local providers often but doing the same for the network providers may create a lot of overhead
    this.interval = setTimeout(this.poll.bind(this), 100);
  }

  public stopPoll(): void {
    clearTimeout(this.interval);
  }

  public async poll(): Promise<void> {
    const networkIdName = 'networkId';
    const accountsName = 'accounts';
    const connectedName = 'connected';
    // getting deep here
    const networkNameName = 'networkName';
    try {
      // get the current network ID
      const newNetworkId = await timeout(this.lib.eth.net.getId(), this.timeout);

      const newNetworkName = getNetworkName(newNetworkId);
      this.updateValueAndFireEvent(
        newNetworkId,
        networkIdName,
        Web3Context.NetworkIdChangedEventName,
        (): unknown[] => [newNetworkName],
      );
      this.updateValueAndFireEvent(newNetworkName, networkNameName);
      // get the accounts
      const newAccounts = await timeout(this.lib.eth.getAccounts(), this.timeout);
      this.updateValueAndFireEvent(newAccounts, accountsName, Web3Context.AccountsChangedEventName);
      // if web3 provider calls are success then we are connected
      this.updateValueAndFireEvent(true, connectedName, Web3Context.ConnectionChangedEventName);
    } catch (e) {
      // provider methods fail so we have to update the state and fire the events
      this.updateValueAndFireEvent(false, connectedName, Web3Context.ConnectionChangedEventName);
      this.updateValueAndFireEvent(null, networkIdName, Web3Context.NetworkIdChangedEventName, (): unknown[] => [null]);
      this.updateValueAndFireEvent(null, networkNameName);
      this.updateValueAndFireEvent(null, accountsName, Web3Context.AccountsChangedEventName);
      // log error here
      console.log(e);
    } finally {
      this.startPoll();
    }
  }

  private updateValueAndFireEvent<T>(
    newValue: T,
    property: string,
    eventName: string = null,
    getArgs: Function = (): unknown[] => [],
  ): void {
    if (newValue !== this[property]) {
      this[property] = newValue;
      if (eventName) this.emit(eventName, this[property], ...getArgs());
    }
  }

  // request access according to the EIP
  // https://github.com/ethereum/EIPs/blob/master/EIPS/eip-1102.md
  public async requestAuth(): Promise<string[]> {
    // Request authentication
    if (this.lib.currentProvider.send !== undefined) {
      return new Promise((resolve, reject): void => {
        const responseHandler = (error, response): void => {
          if (error || response.error) {
            reject(error || response.error);
          } else {
            resolve(response.result);
          }
        };
        const send = this.lib.currentProvider.send as Function;
        send({ method: 'eth_requestAccounts' }, responseHandler);
      });
    } else return Promise.reject(new Error("Web3 provider doesn't support send method"));
  }

  public getProviderName(): string {
    if (!this.lib) return 'unknown';

    const provider = this.lib.currentProvider as ExtendedProvider;

    if (provider.isMetaMask) return 'metamask';

    if (provider.isTrust) return 'trust';

    if (provider.isGoWallet) return 'goWallet';

    if (provider.isAlphaWallet) return 'alphaWallet';

    if (provider.isStatus) return 'status';

    if (provider.isToshi) return 'coinbase';

    if (provider.constructor.name === 'EthereumProvider') return 'mist';

    if (provider.constructor.name === 'Web3FrameProvider') return 'parity';

    if (provider.host && provider.host.indexOf('infura') !== -1) return 'infura';

    return 'unknown';
  }
}
