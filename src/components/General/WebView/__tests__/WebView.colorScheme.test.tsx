/**
 * #479: the page's prefers-color-scheme is a native view property (xamanColorScheme), not a script
 * injected into the page, and setting it leaves the hardened WebView defaults untouched.
 */
import React from 'react';
import renderer from 'react-test-renderer';

import WebViewComponent from '../WebView';

const SOURCE = { uri: 'https://xaman.app' };

const nativeProps = (element: React.ReactElement) => {
    let tree: renderer.ReactTestRenderer;
    renderer.act(() => {
        tree = renderer.create(element);
    });
    // the mocked native view: the node that receives the native-only xamanColorScheme prop
    // @ts-ignore assigned in act
    const [native] = tree.root.findAll((node) => Object.prototype.hasOwnProperty.call(node.props, 'xamanColorScheme'));
    return native.props;
};

describe('WebView colorScheme', () => {
    it('hands the scheme to the native view as xamanColorScheme', () => {
        const dark = nativeProps(<WebViewComponent testID="xapp" source={SOURCE} colorScheme="dark" />);
        const light = nativeProps(<WebViewComponent testID="xapp" source={SOURCE} colorScheme="light" />);
        expect(dark.xamanColorScheme).toBe('dark');
        expect(light.xamanColorScheme).toBe('light');
    });

    it('sends an empty value (follow the system) when no scheme is set', () => {
        const props = nativeProps(<WebViewComponent testID="xapp" source={SOURCE} />);
        expect(props.xamanColorScheme).toBe('');
        expect(props.colorScheme).toBeUndefined();
    });

    it('injects no script and keeps the hardened defaults', () => {
        const props = nativeProps(<WebViewComponent testID="xapp" source={SOURCE} colorScheme="dark" />);
        expect(props.injectedJavaScript).toBeUndefined();
        expect(props.injectedJavaScriptBeforeContentLoaded).toBeUndefined();
        expect(props.originWhitelist).toEqual(['https://*']);
        expect(props.allowFileAccess).toBe(false);
        expect(props.javaScriptCanOpenWindowsAutomatically).toBe(false);
        expect(props.webviewDebuggingEnabled).toBe(false);
    });
});
