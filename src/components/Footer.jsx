import React, { Component } from 'react';
import { Icon } from 'semantic-ui-react';
import './Footer.css';

export class Footer extends Component {
    render() {
        return (
            <div className="footer_main">
                <div className="footer_Icons">
                    <span className="footer_git"><a target="_blank" rel="noreferrer noopener" href="https://github.com/ajf013"><Icon name="github" size="big" /></a></span>
                    <span className="footer_link"><a target="_blank" rel="noreferrer noopener" href="https://www.linkedin.com/in/ajf013-francis-cruz/"><Icon name="linkedin" size="big" /></a></span>
                    <span className="footer_insta"><a target="_blank" rel="noreferrer noopener" href="https://www.instagram.com/fcruz_013/"><Icon name="instagram" size="big" /></a></span>
                    <span className="footer_wht"><a target="_blank" rel="noreferrer noopener" href="https://api.whatsapp.com/send?phone=916379649461"><Icon name="whatsapp" size="big" /></a></span>
                    <span className="footer_twi"><a target="_blank" rel="noreferrer noopener" href="https://x.com/Itsme_Ajf013" aria-label="X (formerly Twitter)"><svg viewBox="0 0 24 24" aria-hidden="true" style={{ width: '26px', height: '26px', fill: 'currentColor', verticalAlign: 'middle', marginTop: '-3px' }}><g><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"></path></g></svg></a></span>
                </div>
                <div className="footer_content">
                    <span>Copyrights <Icon name="copyright" />{new Date().getFullYear()} <strong>Francis Cruz</strong></span>
                </div>
            </div>
        )
    }
}

export default Footer;
