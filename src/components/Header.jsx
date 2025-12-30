import React from 'react';
import './Header.css';
import { Icon } from 'semantic-ui-react';

const Header = ({ theme, toggleTheme }) => {
    return (
        <div className="header-container" data-aos="fade-down">
            <div className="header-title">
                <Icon name="music" /> Music Player
            </div>
            <div className="header-controls">
                <div className={`theme-toggle ${theme}`} onClick={toggleTheme}>
                    <Icon name={theme === 'light' ? 'sun' : 'moon'} />
                </div>
            </div>
        </div>
    );
};

export default Header;
