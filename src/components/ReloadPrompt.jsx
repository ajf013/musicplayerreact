import React from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button, Segment, Header, Icon } from 'semantic-ui-react';
import './ReloadPrompt.css';

function ReloadPrompt() {
    const {
        offlineReady: [offlineReady, setOfflineReady],
        needRefresh: [needRefresh, setNeedRefresh],
        updateServiceWorker,
    } = useRegisterSW({
        onRegistered(r) {
            console.log('SW Registered: ' + r)
        },
        onRegisterError(error) {
            console.log('SW registration error', error)
        },
    });

    const close = () => {
        setOfflineReady(false);
        setNeedRefresh(false);
    };

    return (
        <div className="ReloadPrompt-container">
            {(offlineReady || needRefresh) && (
                <Segment inverted color="violet" className="ReloadPrompt-toast">
                    <div className="ReloadPrompt-message">
                        <Icon name={offlineReady ? "check circle" : "arrow circle up"} size="large" />
                        <div style={{ marginLeft: '10px' }}>
                            {offlineReady ? (
                                <span>App ready to work offline</span>
                            ) : (
                                <span>New content available, click on reload button to update.</span>
                            )}
                        </div>
                    </div>

                    <div className="ReloadPrompt-buttons">
                        {needRefresh && (
                            <Button
                                positive
                                size="small"
                                onClick={() => updateServiceWorker(true)}
                            >
                                Reload
                            </Button>
                        )}
                        <Button
                            size="small"
                            basic
                            inverted
                            onClick={close}
                        >
                            Close
                        </Button>
                    </div>
                </Segment>
            )}
        </div>
    );
}

export default ReloadPrompt;
