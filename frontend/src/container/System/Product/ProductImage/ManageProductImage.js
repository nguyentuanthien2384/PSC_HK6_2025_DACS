import React, { lazy, Suspense, useEffect, useState } from 'react';
import {
    getAllProductDetailImageByIdService, createNewProductImageService, UpdateProductDetailImageService,
    DeleteProductDetailImageService, getAllProductDetailSizeByIdService, createNewProductSizeService,
    UpdateProductDetailSizeService, DeleteProductDetailSizeService
} from '../../../../services/userService';
import { toast } from 'react-toastify';
import './ManageProductImage.scss';
import 'react-image-lightbox/style.css';
import { PAGINATION } from '../../../../utils/constant';
import ReactPaginate from 'react-paginate';
import { useParams } from 'react-router-dom';
import usePagedAdminList from '../../usePagedAdminList';
const Lightbox = lazy(() => import('react-image-lightbox'));
const AddImageModal = lazy(() => import('./AddImageModal'));
const AddSizeModal = lazy(() => import('./AddSizeModal'));
const ManageProductImage = () => {

    const { id } = useParams()
    const images = usePagedAdminList(getAllProductDetailImageByIdService, { id });
    const sizes = usePagedAdminList(getAllProductDetailSizeByIdService, { id });
    const { data: dataProductDetailImage, count, page: numberPage, reload: loadProductDetailImage } = images;
    const { data: dataProductDetailSize, count: countSize, page: numberSizePage, reload: loadProductDetailSize } = sizes;
    const [isOpen, setisOpen] = useState(false)
    const [isOpenModal, setisOpenModal] = useState(false)
    const [isOpenModalSize, setisOpenModalSize] = useState(false)
    const [imgPreview, setimgPreview] = useState('')
    const [productImageId, setproductImageId] = useState('')
    const [productSizeId, setproductSizeId] = useState('')
    useEffect(() => { setisOpen(false); setisOpenModal(false); setisOpenModalSize(false); setproductImageId(''); setproductSizeId(''); }, [id]);
    let openPreviewImage = (url) => {


        setimgPreview(url);
        setisOpen(true);

    }
    let closeModal = () => {
        setisOpenModal(false)
        setproductImageId('')
    }
    let handleOpenModal = () => {
        setisOpenModal(true)
    }
    let closeModalSize = () => {
        setisOpenModalSize(false)
        setproductSizeId('')
    }
    let handleOpenModalSize = () => {
        setisOpenModalSize(true)
    }
    let sendDataFromModal = async (data) => {
        if (data.isActionUpdate === false) {
            let response = await createNewProductImageService({
                caption: data.caption,
                image: data.image,
                id: id
            })
            if (response && response.errCode === 0) {
                toast.success("Thêm hình ảnh thành công !")
                setisOpenModal(false)
                await loadProductDetailImage()
            } else {
                toast.error("Thêm hình ảnh thất bại !")
            }
        } else {
            let response = await UpdateProductDetailImageService({
                caption: data.caption,
                image: data.image,
                id: data.id
            })
            if (response && response.errCode === 0) {
                setproductImageId('')
                toast.success("Cập nhật hình ảnh thành công !")
                setisOpenModal(false)
                await loadProductDetailImage()

            } else {
                toast.error("Cập nhật ảnh thất bại !")
            }
        }

    }
    let sendDataFromModalSize = async (data) => {
        if (data.isActionUpdate === false) {
            let response = await createNewProductSizeService({
                productdetailId: id,
                sizeId: data.sizeId,
                width: data.width,
                height: data.height,
                stock: data.stock,
                weight: data.weight
            })
            if (response && response.errCode === 0) {
                toast.success("Thêm kích thước thành công !")
                setisOpenModalSize(false)
                await loadProductDetailSize()

            } else {
                toast.error("Thêm kích thước thất bại")
            }
        } else {
            let response = await UpdateProductDetailSizeService({
                sizeId: data.sizeId,
                width: data.width,
                height: data.height,
                stock: data.stock,
                id: data.id,
                weight: data.weight
            })
            if (response && response.errCode === 0) {
                setproductSizeId('')
                toast.success("Cập nhật kích thước thành công !")
                setisOpenModalSize(false)
                await loadProductDetailSize()

            } else {
                toast.error("Cập nhật kích thước thất bại !")
            }
        }
    }
    let handleEditProductImage = (id) => {
        setproductImageId(id)
        setisOpenModal(true)
    }
    let handleEditProductSize = (id) => {
        setproductSizeId(id)
        setisOpenModalSize(true)
    }
    let handleDeleteProductImage = async (productdetailImageId) => {

        let response = await DeleteProductDetailImageService({
            data: {
                id: productdetailImageId
            }
        })
        if (response && response.errCode === 0) {
            toast.success("Xóa hình ảnh thành công !")
            loadProductDetailImage();
        } else {
            toast.error("Xóa hình ảnh thất bại !")
        }
    }
    let handleDeleteProductSize = async (productdetailsizeId) => {
        let response = await DeleteProductDetailSizeService({
            data: {
                id: productdetailsizeId
            }
        })
        if (response && response.errCode === 0) {
            toast.success("Xóa kích thước thành công !")
            loadProductDetailSize();
        } else {
            toast.error("Xóa hình ảnh thất bại !")
        }
    }
    let handleChangePage = number => { if (!images.loading) images.setPage(number.selected); };
    let handleChangePageProductSize = number => { if (!sizes.loading) sizes.setPage(number.selected); };
    return (
        <div className="container-fluid px-4 product-image-management">
            <h1 className="mt-4">Thông tin chi tiết sản phẩm</h1>

            <div>
                <div className="card mb-4">
                    <div className="card-header">
                        <i className="fas fa-table me-1" />
                        Danh sách hình ảnh chi tiết sản phẩm
                        <button type="button" aria-label="Thêm hình ảnh" onClick={handleOpenModal} className="float-right btn btn-link"><i style={{ fontSize: '35px', color: '#0D6EFD' }} className="fas fa-plus-square" /></button>
                    </div>
                    <div className="card-body">
                        <p role="status" style={{ minHeight: 24 }}>{images.loading ? 'Đang tải hình ảnh…' : ''}</p>
                        {images.error && <p role="alert">{images.error} <button type="button" onClick={loadProductDetailImage}>Thử lại</button></p>}
                        <div className="table-responsive" aria-busy={images.loading}>
                            <table className="table table-bordered" inert={images.loading ? true : undefined} style={{ border: '1' }} width="100%" cellSpacing="0">
                                <thead>
                                    <tr>
                                        <th>STT</th>
                                        <th>Tên hình ảnh</th>
                                        <th>Hình ảnh</th>
                                        <th>Thao tác</th>
                                    </tr>
                                </thead>

                                <tbody>
                                    {dataProductDetailImage && dataProductDetailImage.length > 0 &&
                                        dataProductDetailImage.map((item, index) => {
                                            return (
                                                <tr key={item.id}>
                                                    <td>{numberPage * PAGINATION.pagerow + index + 1}</td>
                                                    <td>{item.caption}</td>
                                                    <td><button type="button" className="product-image-preview" aria-label={`Xem hình ${item.caption || item.id}`} onClick={() => openPreviewImage(item.previewImage || item.image)}><img src={item.image} alt={item.caption || ''} className="box-image" width={100} height={40} loading="lazy" decoding="async" /></button></td>
                                                    <td>

                                                        <span onClick={() => handleEditProductImage(item.id)} style={{ color: '#0E6DFE', cursor: 'pointer' }}   >Edit</span>
                                                        &nbsp; &nbsp;
                                                        <span onClick={() => handleDeleteProductImage(item.id)} style={{ color: '#0E6DFE', cursor: 'pointer' }}   >Delete</span>

                                                    </td>
                                                </tr>
                                            )
                                        })
                                    }




                                </tbody>
                            </table>
                        </div>
                    </div>
                    {isOpenModal && <Suspense fallback={<p role="status">Đang mở biểu mẫu hình ảnh…</p>}><AddImageModal
                        isOpenModal={isOpenModal}
                        closeModal={closeModal}
                        sendDataFromModal={sendDataFromModal}
                        productImageId={productImageId}
                    /></Suspense>}
                </div>

                {
                    isOpen === true &&
                    <Suspense fallback={<p role="status">Đang mở hình ảnh…</p>}><Lightbox mainSrc={imgPreview}
                        onCloseRequest={() => setisOpen(false)}
                    /></Suspense>
                }
                <ReactPaginate
                    previousLabel={'Quay lại'}
                    nextLabel={'Tiếp'}
                    breakLabel={'...'}
                    pageCount={Math.max(1, count)}
                    forcePage={numberPage}
                    disableInitialCallback
                    marginPagesDisplayed={3}
                    containerClassName={"pagination justify-content-center"}
                    pageClassName={"page-item"}
                    pageLinkClassName={"page-link"}
                    previousLinkClassName={"page-link"}
                    nextClassName={"page-item"}
                    nextLinkClassName={"page-link"}
                    breakLinkClassName={"page-link"}
                    breakClassName={"page-item"}
                    activeClassName={"active"}
                    onPageChange={handleChangePage}
                />
            </div>

            <div>
                <div className="card mb-4">
                    <div className="card-header">
                        <i className="fas fa-table me-1" />
                        Danh sách kích thước chi tiết sản phẩm
                        <button type="button" aria-label="Thêm kích thước" onClick={handleOpenModalSize} className="float-right btn btn-link"><i style={{ fontSize: '35px', color: '#0D6EFD' }} className="fas fa-plus-square" /></button>
                    </div>
                    <div className="card-body">
                        <p role="status" style={{ minHeight: 24 }}>{sizes.loading ? 'Đang tải kích thước…' : ''}</p>
                        {sizes.error && <p role="alert">{sizes.error} <button type="button" onClick={loadProductDetailSize}>Thử lại</button></p>}
                        <div className="table-responsive" aria-busy={sizes.loading}>
                            <table className="table table-bordered" inert={sizes.loading ? true : undefined} style={{ border: '1' }} width="100%" cellSpacing="0">
                                <thead>
                                    <tr>
                                        <th>STT</th>
                                        <th>Kích thước</th>
                                        <th>Chiều rộng</th>
                                        <th>Chiều dài</th>
                                        <th>Khối lượng</th>
                                        <th>Số lượng tồn</th>
                                        <th>Thao tác</th>
                                    </tr>
                                </thead>

                                <tbody>
                                    {dataProductDetailSize && dataProductDetailSize.length > 0 &&
                                        dataProductDetailSize.map((item, index) => {
                                            return (
                                                <tr key={item.id}>
                                                    <td>{numberSizePage * PAGINATION.pagerow + index + 1}</td>
                                                    <td>{item.sizeData.value}</td>
                                                    <td>{item.width}</td>
                                                    <td>{item.height}</td>
                                                    <td>{item.weight}</td>
                                                    <td>{item.stock}</td>
                                                    <td>

                                                        <span onClick={() => handleEditProductSize(item.id)} style={{ color: '#0E6DFE', cursor: 'pointer' }}   >Edit</span>
                                                        &nbsp; &nbsp;
                                                        <span onClick={() => handleDeleteProductSize(item.id)} style={{ color: '#0E6DFE', cursor: 'pointer' }}   >Delete</span>

                                                    </td>
                                                </tr>
                                            )
                                        })
                                    }
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {isOpenModalSize && <Suspense fallback={<p role="status">Đang mở biểu mẫu kích thước…</p>}><AddSizeModal
                        isOpenModal={isOpenModalSize}
                        closeModal={closeModalSize}
                        sendDataFromModalSize={sendDataFromModalSize}
                        productSizeId={productSizeId}
                    /></Suspense>}
                </div>

                <ReactPaginate
                    previousLabel={'Quay lại'}
                    nextLabel={'Tiếp'}
                    breakLabel={'...'}
                    pageCount={Math.max(1, countSize)}
                    forcePage={numberSizePage}
                    disableInitialCallback
                    marginPagesDisplayed={3}
                    containerClassName={"pagination justify-content-center"}
                    pageClassName={"page-item"}
                    pageLinkClassName={"page-link"}
                    previousLinkClassName={"page-link"}
                    nextClassName={"page-item"}
                    nextLinkClassName={"page-link"}
                    breakLinkClassName={"page-link"}
                    breakClassName={"page-item"}
                    activeClassName={"active"}
                    onPageChange={handleChangePageProductSize}
                />
            </div>
        </div >
    )
}
export default ManageProductImage;
