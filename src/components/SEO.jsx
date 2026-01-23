import React from 'react';
import { Helmet } from 'react-helmet-async';

const SEO = ({ title, description, keywords, name, type, image }) => {
  return (
    <Helmet>
      {/* Standard metadata tags */}
      <title>{title}</title>
      <meta name='description' content={description} />
      <meta name='keywords' content={keywords} />

      {/* Facebook tags */}
      <meta property='og:type' content={type} />
      <meta property='og:title' content={title} />
      <meta property='og:description' content={description} />
      {image && <meta property='og:image' content={image} />}
      {/* Twitter tags */}
      <meta name='twitter:creator' content={name} />
      <meta name='twitter:card' content={type} />
      <meta name='twitter:title' content={title} />
      <meta name='twitter:description' content={description} />
    </Helmet>
  );
};

SEO.defaultProps = {
  title: 'Free Web Music App | Online Music Player – fcruz.org',
  description: 'Music.fcruz.org is a fast, free web music app to stream and manage your favorite songs online. Lightweight, secure, and built for performance.',
  keywords: 'free web music app, online music player, music streaming app, lightweight music app, music.fcruz.org, browser music player, no download music player',
  name: 'Francis Cruz',
  type: 'website',
  image: 'https://music.fcruz.org/og-image.png' // Ensure this image exists in your public folder or use a remote URL
};

export default SEO;
