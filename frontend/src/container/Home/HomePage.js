import { getUser } from '../../utils/token';
import React, { useState, useEffect } from 'react';
import HomeBanner from '../../component/HomeFeature/HomeBanner';
import MainFeature from '../../component/HomeFeature/MainFeature';
import ProductFeature from '../../component/HomeFeature/ProductFeature';
import NewProductFeature from '../../component/HomeFeature/NewProductFeature';
import HomeBlog from '../../component/HomeFeature/HomeBlog';
import { getAllBanner, getProductFeatureService, getProductNewService, getNewBlog, getProductRecommendService } from '../../services/userService';
import Slider from 'react-slick';
import 'slick-carousel/slick/slick.css';
import 'slick-carousel/slick/slick-theme.css';
import './HomePage.scss';

const initialCollection = { data: [], loading: true, error: '' };

function HomePage() {
    const [featured, setFeatured] = useState(initialCollection);
    const [newProducts, setNewProducts] = useState(initialCollection);
    const [recommendations, setRecommendations] = useState({ data: [], loading: false, error: '' });
    const [blogs, setBlogs] = useState([]);
    const [banners, setBanners] = useState([]);

    useEffect(() => {
        let cancelled = false;
        const loadCollection = async (request, update) => {
            try {
                const response = await request;
                if (!response || response.errCode !== 0 || !Array.isArray(response.data)) {
                    throw new Error('Không thể tải sản phẩm');
                }
                if (!cancelled) update({ data: response.data, loading: false, error: '' });
            } catch (error) {
                if (!cancelled) update({ data: [], loading: false, error: 'load-failed' });
            }
        };
        loadCollection(getProductFeatureService(6), setFeatured);
        loadCollection(getProductNewService(8), setNewProducts);

        const user = getUser();
        if (user) {
            setRecommendations(initialCollection);
            loadCollection(getProductRecommendService({ limit: 20, userId: user.id }), setRecommendations);
        }

        getAllBanner({ limit: 6, offset: 0, keyword: '' })
            .then((response) => {
                if (!cancelled && response?.errCode === 0) setBanners(response.data || []);
            })
            .catch(() => {});
        getNewBlog(3)
            .then((response) => {
                if (!cancelled && response?.errCode === 0) setBlogs(response.data || []);
            })
            .catch(() => {});
        window.scrollTo(0, 0);
        return () => { cancelled = true; };
    }, []);

    const bannerSettings = {
        dots: false,
        infinite: banners.length > 1,
        speed: 500,
        slidesToShow: 1,
        slidesToScroll: 1,
        autoplaySpeed: 4000,
        autoplay: banners.length > 1,
        cssEase: 'ease',
    };

    return (
        <main className="store-home">
            {!!banners.length && (
                <Slider {...bannerSettings}>
                    {banners.map((item) => <HomeBanner key={item.id} image={item.image} name={item.name} />)}
                </Slider>
            )}
            <MainFeature />
            <ProductFeature
                title="Gợi ý sản phẩm"
                eyebrow="Dành riêng cho bạn"
                description="Thêm lựa chọn phù hợp với phong cách bạn yêu thích."
                {...recommendations}
                hideWhenEmpty
            />
            <ProductFeature
                title="Sản phẩm đặc trưng"
                description="Những thiết kế nổi bật, dễ dàng kết hợp cùng phong cách của bạn."
                {...featured}
            />
            <NewProductFeature
                title="Sản phẩm mới"
                description="Cập nhật phong cách với những sản phẩm mới nhất tại cửa hàng."
                {...newProducts}
            />
            {!!blogs.length && <HomeBlog data={blogs} />}
        </main>
    );
}

export default HomePage;
