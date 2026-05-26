import React, { useState, useEffect } from 'react';
import HomeBanner from "../../component/HomeFeature/HomeBanner";
import MainFeature from "../../component/HomeFeature/MainFeature";
import ProductFeature from "../../component/HomeFeature/ProductFeature";
import NewProductFeature from "../../component/HomeFeature/NewProductFeature"
import { getProductFeatureService, getProductNewService } from '../../services/userService';
import Slider from 'react-slick';
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";

function HomePage(props) {
    const [dataProductFeature, setDataProductFeature] = useState([])
    const [dataNewProductFeature, setNewProductFeature] = useState([])
    let settings = {
        dots: false,
        Infinity: false,
        speed: 500,
        slidesToShow: 1,
        slidesToScroll: 1,
        autoplaySpeed: 2000,
        autoplay: true,
        cssEase: "linear"
    }

    useEffect(() => {
        fetchProductFeature()
        fetchProductNew()
        window.scrollTo(0, 0);
    }, [])

    let fetchProductFeature = async () => {
        let res = await getProductFeatureService(6)
        if (res && res.errCode === 0) {
            setDataProductFeature(res.data)
        }
    }
    let fetchProductNew = async () => {
        let res = await getProductNewService(8)
        if (res && res.errCode === 0) {
            setNewProductFeature(res.data)
        }
    }

    return (
        <div>
            <Slider {...settings}>
                <HomeBanner></HomeBanner>
            </Slider>
            <MainFeature></MainFeature>
            <ProductFeature title={"Sản phẩm đặc trưng"} data={dataProductFeature}></ProductFeature>
            <NewProductFeature title="Sản phẩm mới" description="Những sản phẩm vừa ra mắt mới lạ cuốn hút người xem" data={dataNewProductFeature}></NewProductFeature>
        </div>
    );
}

export default HomePage;
