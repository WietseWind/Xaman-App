import React from 'react';
import renderer, { act, ReactTestRenderer } from 'react-test-renderer';
import { Text } from 'react-native';
import NetworkService, { NetworkStateStatus } from '@services/NetworkService';
import NodeConnection from '../NodeConnection';

jest.mock('@services/NetworkService', () => {
    const EventEmitter = require('events');
    const service = new EventEmitter();
    service.getConnectionStatus = jest.fn();
    service.getConnectedEndpoint = jest.fn();
    return {
        __esModule: true,
        default: service,
        NetworkStateStatus: { Connected: 'Connected', Connecting: 'Connecting', Disconnected: 'Disconnected' },
    };
});
jest.mock('@store/repositories/core', () => ({ __esModule: true, default: {} }));
jest.mock('@common/helpers/device', () => ({ GetLayoutInsets: () => ({ top: 20, bottom: 34 }) }));

let tree: ReactTestRenderer;
const fallback = 'wss://default.example.com';
const connectionLabel = () => tree.root.findByProps({ testID: 'node-connection' }).props.accessibilityLabel;

beforeEach(() => {
    jest.mocked(NetworkService.getConnectionStatus).mockReturnValue(NetworkStateStatus.Connected);
    jest.mocked(NetworkService.getConnectedEndpoint).mockReturnValue('wss://live.example.com');
});
afterEach(() => { act(() => tree?.unmount()); });

it('starts from the live socket and keeps the complete endpoint accessible while shortening its display', () => {
    const endpoint = 'wss://live.example.com:6006/custom';
    jest.mocked(NetworkService.getConnectedEndpoint).mockReturnValue(endpoint);
    act(() => { tree = renderer.create(<NodeConnection fallbackEndpoint={fallback} />); });
    expect(connectionLabel()).toBe(`Connected: ${endpoint}`);
    expect(tree.root.findAllByType(Text).map(text => text.props.children))
        .toEqual(['live.example.com:6006/custom', 'Connected']);
});

it('updates connecting and offline states even when the node name has not changed', () => {
    act(() => { tree = renderer.create(<NodeConnection fallbackEndpoint={fallback} />); });
    [NetworkStateStatus.Connecting, NetworkStateStatus.Disconnected, NetworkStateStatus.Connected].forEach(status => {
        act(() => {
            jest.mocked(NetworkService.getConnectionStatus).mockReturnValue(status);
            NetworkService.emit('stateChange', status);
        });
        expect(connectionLabel()).toBe(`${status}: wss://live.example.com`);
    });
});

it('follows a failover endpoint on connect without showing the configured default as the live node', () => {
    act(() => { tree = renderer.create(<NodeConnection fallbackEndpoint={fallback} />); });
    act(() => {
        jest.mocked(NetworkService.getConnectedEndpoint).mockReturnValue('wss://failover.example.com');
        NetworkService.emit('connect', {} as any);
    });
    expect(connectionLabel()).toBe('Connected: wss://failover.example.com');
});

it('refreshes a changed fallback and releases both socket listeners when hidden or unmounted', () => {
    jest.mocked(NetworkService.getConnectedEndpoint).mockReturnValue('');
    jest.mocked(NetworkService.getConnectionStatus).mockReturnValue(NetworkStateStatus.Connecting);
    act(() => { tree = renderer.create(<NodeConnection fallbackEndpoint={fallback} />); });
    expect(connectionLabel()).toBe(`Connecting: ${fallback}`);
    act(() => { tree.update(<NodeConnection fallbackEndpoint="wss://other-network.example.com" />); });
    expect(connectionLabel()).toBe('Connecting: wss://other-network.example.com');
    expect(NetworkService.listenerCount('stateChange')).toBe(1);
    expect(NetworkService.listenerCount('connect')).toBe(1);
    act(() => { tree.unmount(); });
    expect(NetworkService.listenerCount('stateChange')).toBe(0);
    expect(NetworkService.listenerCount('connect')).toBe(0);
});
