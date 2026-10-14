import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Slider from 'react-slick';
import HomeBanner from './HomeBanner';

jest.mock('react-router-dom', () => ({ Link: ({ children, to }) => <a href={to}>{children}</a> }), { virtual: true });

test('on-demand banner navigation mounts only the active image instead of all six banner images', async () => {
    const previousMatchMedia = window.matchMedia;
    window.matchMedia = jest.fn(() => ({ matches: false, addListener: jest.fn(), removeListener: jest.fn() }));
    const banners = Array.from({ length: 6 }, (_, index) => ({ id: index, image: `https://example.com/banner-${index}.webp` }));
    const { container, unmount } = render(
        <Slider infinite lazyLoad="ondemand" slidesToShow={1} slidesToScroll={1} autoplay={false} speed={0}>
            {banners.map((banner, index) => <HomeBanner key={banner.id} name={`Banner ${index}`} image={banner.image} priority={index === 0} />)}
        </Slider>,
    );
    const loadedSources = () => [...new Set(Array.from(container.querySelectorAll('.box-banner__image'), image => image.src))];
    expect(loadedSources()).toEqual(['https://example.com/banner-0.webp']);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(loadedSources()).toContain('https://example.com/banner-1.webp'));
    expect(loadedSources()).toHaveLength(2);
    unmount();
    window.matchMedia = previousMatchMedia;
});
